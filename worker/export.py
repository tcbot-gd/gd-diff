#!/usr/bin/env python3
"""gd-diff IDA export script.

Runs inside IDA (headless):  idat -A -c -L"log.txt" -S"export.py" <binary>

Configuration is read from the environment (set by the worker):
  IDA_EXPORT_OUT    output directory
  IDA_EXPORT_MODE   "raw" | "broma"

Output:
  <out>/functions.ndjson   one JSON object per line (one per function)
  <out>/meta.json          run metadata
"""

import json
import os
import re
import sys
import time
import traceback

import idaapi
import idautils
import ida_bytes
import ida_funcs
import ida_hexrays
import ida_idp
import ida_lines
import ida_name
import ida_typeinf
import ida_ua
import idc

BADADDR = idaapi.BADADDR
OUT = os.environ.get("IDA_EXPORT_OUT", ".")
MODE = os.environ.get("IDA_EXPORT_MODE", "raw")

CALL_MNEMONICS = {"call", "bl", "blx", "blr", "jsr", "brasl", "call.l", "callq"}


def configure_decompiler():
    """Raise decompiler limits so large Geometry Dash functions still decompile.

    The function-size limit lives in hexrays.cfg (MAX_FUNCSIZE, default 64KB); the
    worker installs a bumped override through $IDAUSR. We additionally try the
    older flag-based API when present, harmlessly.
    """
    try:
        if hasattr(ida_hexrays, "set_hexrays_flags"):
            flags = ida_hexrays.get_hexrays_flags()
            ida_hexrays.set_hexrays_flags(flags | 0x7FFFFFFF)
    except Exception:
        pass


def demangle(name):
    if not name:
        return None
    try:
        get_flags = getattr(ida_name, "get_inf_compound", None)
        disable_mask = get_flags() if get_flags else 0
        return ida_name.demangle_name(name, disable_mask) or None
    except Exception:
        return None


def get_signature(func):
    try:
        return idc.get_type(func.start_ea) or None
    except Exception:
        return None


def export_asm(func):
    result = []
    maxop = getattr(ida_ua, "UA_MAXOP", 8)
    for ea in idautils.FuncItems(func.start_ea):
        insn = ida_ua.insn_t()
        size = ida_ua.decode_insn(insn, ea)
        if size == 0:
            continue
        raw = ida_bytes.get_bytes(ea, size) or b""
        operands = []
        for i in range(maxop):
            op = idc.print_operand(ea, i)
            if op:
                operands.append(ida_lines.tag_remove(op))
        result.append(
            {
                "addr": ea,
                "bytes": raw.hex(" "),
                "mnemonic": idc.print_insn_mnem(ea),
                "operands": ", ".join(operands),
            }
        )
    return result


def export_hex(func):
    start = func.start_ea
    size = func.end_ea - start
    data = ida_bytes.get_bytes(start, size) or b""
    result = []
    for off in range(0, len(data), 16):
        chunk = data[off : off + 16]
        ascii_repr = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        result.append({"addr": start + off, "bytes": chunk.hex(" "), "ascii": ascii_repr})
    return result


def _is_call_insn(insn):
    try:
        return ida_idp.is_call_insn(insn)
    except Exception:
        return False


def export_calls(func):
    result = []
    seen = set()
    for ea in idautils.FuncItems(func.start_ea):
        insn = ida_ua.insn_t()
        if ida_ua.decode_insn(insn, ea) == 0:
            continue
        mnem = idc.print_insn_mnem(ea).lower()
        if mnem not in CALL_MNEMONICS and not _is_call_insn(insn):
            continue
        for target in idautils.CodeRefsFrom(ea, 1):
            if target == BADADDR or target in seen:
                continue
            seen.add(target)
            name = (
                ida_name.get_name(target)
                or ida_funcs.get_func_name(target)
                or ("sub_%X" % target)
            )
            result.append({"addr": ea, "target": target, "name": name})
    return result


def decompile(func):
    try:
        return ida_hexrays.decompile_func(func, None, 0)
    except Exception:
        return None

def export_pseudocode(cfunc):
    result = []
    if cfunc is None:
        return result
    try:
        lines = cfunc.get_pseudocode()
        for i, sline in enumerate(lines):
            text = ida_lines.tag_remove(sline.line)
            addrs = []
            for is_ctree in (True, False):
                try:
                    phead = ida_hexrays.ctree_item_t()
                    pitem = ida_hexrays.ctree_item_t()
                    ptail = ida_hexrays.ctree_item_t()
                    if cfunc.get_line_item(sline.line, 0, is_ctree, phead, pitem, ptail):
                        item = pitem.it
                        if item is not None and item.ea != BADADDR:
                            addrs.append(item.ea)
                            break
                except Exception:
                    continue
            result.append({"line": i + 1, "text": text, "addrs": addrs})
    except Exception:
        pass
    return result


def export_members(cfunc):
    result = []
    seen = set()
    if cfunc is None:
        return result
    try:
        lvars = cfunc.get_lvars()
    except Exception:
        lvars = []
    try:
        for item in cfunc.treeitems:
            if not item.is_expr():
                continue
            e = item.cexpr
            if e.op not in (ida_hexrays.cot_memptr, ida_hexrays.cot_memref):
                continue
            try:
                obj = e.x
                ti = obj.type
                if e.op == ida_hexrays.cot_memptr and ti.is_ptr():
                    ti = ti.get_pointed_object()
                owner = ti.get_type_name()
                if not owner:
                    # Global member refs (e.g. `SomeClass::m_field` where obj is a
                    # cot_obj) have no base expression type; use the UDT's name.
                    owner = ida_typeinf.tinfo_t(e.m.get_type()).get_type_name()
                if not owner:
                    continue
                udt = ida_typeinf.udt_type_data_t()
                if not ti.get_udt_details(udt):
                    continue
                # e.m is the member offset; match it against the UDT member list
                # (udt_type_data_t is a vector of udm_t, each carrying .offset in
                # bits). Hex-Rays reports e.m in bits, but tolerate byte offsets too.
                name = ""
                for i in range(udt.size()):
                    udm = udt.at(i)
                    if udm.offset == e.m or udm.offset // 8 == e.m:
                        name = udm.name
                        break
                if not name:
                    continue
            except Exception:
                continue

            kind = "external"
            if obj.op == ida_hexrays.cot_var:
                try:
                    idx = obj.v.idx if hasattr(obj.v, "idx") else obj.v
                    if 0 <= idx < len(lvars) and lvars[idx].name in ("this", "self"):
                        kind = "this"
                except Exception:
                    pass

            key = (owner, name, kind)
            if key in seen:
                continue
            seen.add(key)
            result.append(
                {
                    "owner": owner,
                    "name": name,
                    "kind": kind,
                    "addrs": [] if e.ea == BADADDR else [e.ea],
                }
            )
    except Exception:
        pass
    return result


def _strip_renamed_from(text):
    """Remove `[[renamed_from(...)]]` attributes, which pybroma doesn't support yet."""
    return re.sub(r"[ \t]*\[\[renamed_from\([^)]*\)\]\][ \t]*\n?", "", text)


def apply_broma_bindings():
    """Apply geode-sdk bindings to the (already analyzed) database via BromaIDA.

    The broma pass loads a copy of the raw pass's analyzed database (so we analyze
    once), then imports bindings + types through BromaIDA before exporting.
    """
    if MODE != "broma":
        return

    import tempfile

    broma_plugin_dir = os.environ.get("BROMA_PLUGIN_DIR", "")
    bindings_root = os.environ.get("BROMA_BINDINGS_DIR", "")
    version = os.environ.get("IDA_EXPORT_VERSION", "")
    platform = os.environ.get("IDA_EXPORT_PLATFORM", "win")

    if not broma_plugin_dir or not bindings_root or not version:
        raise RuntimeError(
            "broma mode requires BROMA_PLUGIN_DIR, BROMA_BINDINGS_DIR and IDA_EXPORT_VERSION"
        )

    bromas_dir = os.path.join(bindings_root, "bindings", version)
    if not os.path.isdir(bromas_dir):
        raise RuntimeError("bindings directory not found: %s" % bromas_dir)

    # Copy the .bro files to a temp dir, stripping the unsupported
    # [[renamed_from(...)]] attributes before pybroma parses them.
    # BromaCodegen resolves `bpath/../include/Geode/Enums.hpp`, so we mirror the
    # repo layout (version dir + include/ as siblings) under the temp root.
    import shutil

    cleaned_root = tempfile.mkdtemp(prefix="broma_bindings_")
    cleaned_dir = os.path.join(cleaned_root, version)
    os.makedirs(cleaned_dir, exist_ok=True)
    for bfile in ("Cocos2d.bro", "Extras.bro", "FMOD.bro", "GeometryDash.bro", "Kazmath.bro"):
        src = os.path.join(bromas_dir, bfile)
        if not os.path.exists(src):
            continue
        with open(src, "r", encoding="utf-8") as fh:
            content = fh.read()
        with open(os.path.join(cleaned_dir, bfile), "w", encoding="utf-8") as fh:
            fh.write(_strip_renamed_from(content))

    include_src = os.path.join(bindings_root, "bindings", "include")
    if os.path.isdir(include_src):
        shutil.copytree(include_src, os.path.join(cleaned_root, "include"))

    print("[export] prepared broma bindings in %s" % cleaned_dir)

    # Make BromaIDA importable and suppress its popups for headless (-A) mode.
    sys.path.insert(0, broma_plugin_dir)

    from ida_kernwin import ASKBTN_BTN1
    from broma_ida.ui.ask_popup import AskPopup
    from broma_ida.ui.simple_popup import SimplePopup

    AskPopup.show = lambda self: ASKBTN_BTN1
    SimplePopup.show = lambda self: 1

    from broma_ida.data.data_manager import DataManager
    from broma_ida.metadata import PLUGIN_NAME
    from platformdirs import PlatformDirs

    shelf_dir = PlatformDirs(appname=PLUGIN_NAME, appauthor=False)
    dm = DataManager()
    dm.init(shelf_dir.user_config_path / "shelf")
    dm.set("disable_input_hash_check", True)
    dm.set("always_overwrite_merge_information", True)
    dm.set("always_overwrite_idb", True)
    dm.set("ignore_mismatched_structs", True)
    dm.set("import_types", True)

    types_dir = os.path.join(broma_plugin_dir, "broma_ida", "types")
    if not os.path.isdir(types_dir):
        types_dir = os.path.join(broma_plugin_dir, "types")

    from pathlib import Path
    from broma_ida.broma.importer import BromaImporter

    print("[export] applying broma bindings (platform=%s)" % platform)
    importer = BromaImporter(platform, Path(types_dir), Path(cleaned_dir))
    importer.parse_bromas()
    importer.import_into_idb()
    dm.close()
    print("[export] broma bindings applied")


def write_progress(phase, done, total, current=None, current_size=None):
    payload = {
        "phase": phase,
        "functions_done": done,
        "functions_total": total,
        "current_function": current,
        "current_function_size": current_size,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        with open(os.path.join(OUT, "progress.json"), "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
    except Exception:
        pass


def write_error(message):
    try:
        with open(os.path.join(OUT, "error.json"), "w", encoding="utf-8") as fh:
            json.dump({"error": message}, fh, indent=2)
    except Exception:
        pass


def qexit(code):
    try:
        import ida_pro

        ida_pro.qexit(code)
    except Exception:
        idaapi.qexit(code)


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT, exist_ok=True)
    write_progress("analyzing", 0, None)

    configure_decompiler()
    try:
        ida_hexrays.init_hexrays_plugin()
    except Exception:
        pass

    import ida_auto

    ida_auto.auto_wait()

    apply_broma_bindings()

    funcs = list(idautils.Functions())
    total = len(funcs)
    write_progress("decompiling", 0, total)
    print("[export] %d functions to process" % total)

    ndjson_path = os.path.join(OUT, "functions.ndjson")
    count = 0
    with open(ndjson_path, "w", encoding="utf-8") as fh:
        for ea in funcs:
            func = ida_funcs.get_func(ea)
            if func is None:
                continue
            name = (
                ida_funcs.get_func_name(func.start_ea)
                or ida_name.get_name(func.start_ea)
                or ("sub_%X" % func.start_ea)
            )
            size = func.end_ea - func.start_ea
            # Report before decompiling so the UI shows the function currently
            # being worked on (a single huge function can take a long time).
            write_progress("decompiling", count, total, name, size)
            cfunc = decompile(func)
            record = {
                "name": name,
                "demangled": demangle(name),
                "address": func.start_ea,
                "size": size,
                "signature": get_signature(func),
                "asm": export_asm(func),
                "hex": export_hex(func),
                "calls": export_calls(func),
                "pseudocode": export_pseudocode(cfunc),
                "members": export_members(cfunc),
            }
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
            if count % 100 == 0:
                print("[export] %d / %d functions" % (count, total))

    image_base = None
    try:
        import ida_nalt

        image_base = ida_nalt.get_imagebase()
    except Exception:
        pass

    meta = {
        "mode": MODE,
        "input": idaapi.get_input_file_path(),
        "idb": idaapi.get_path(idaapi.PATH_TYPE_IDB),
        "image_base": image_base,
        "functions": count,
    }
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    write_progress("done", count, total)
    print("[export] wrote %d functions to %s" % (count, ndjson_path))
    qexit(0)


try:
    main()
except Exception:
    tb = traceback.format_exc()
    write_progress("failed", 0, None)
    write_error(tb)
    print("[export] FAILED:\n%s" % tb)
    qexit(1)

