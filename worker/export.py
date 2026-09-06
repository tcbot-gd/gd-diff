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
                    continue
                udt = ida_typeinf.udt_type_data_t()
                if not ti.get_udt_details(udt):
                    continue
                name = udt.get_udm_name(e.m)
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


def apply_broma_bindings():
    """Apply geode-sdk bindings before decompiling (broma mode).

    BromaIDA loads a bindings checkout and applies names/types. The exact API is
    plugin-specific; wire it up here once the plugin is provided. For now this is
    a no-op placeholder so the raw export path is fully functional.
    """
    if MODE != "broma":
        return
    print("[export] broma mode requested; bindings application is a stub")


def main():
    configure_decompiler()
    apply_broma_bindings()
    try:
        ida_hexrays.init_hexrays_plugin()
    except Exception:
        pass

    import ida_auto

    ida_auto.auto_wait()

    if not os.path.isdir(OUT):
        os.makedirs(OUT, exist_ok=True)

    ndjson_path = os.path.join(OUT, "functions.ndjson")
    count = 0
    with open(ndjson_path, "w", encoding="utf-8") as fh:
        for ea in idautils.Functions():
            func = ida_funcs.get_func(ea)
            if func is None:
                continue
            name = (
                ida_funcs.get_func_name(func.start_ea)
                or ida_name.get_name(func.start_ea)
                or ("sub_%X" % func.start_ea)
            )
            cfunc = decompile(func)
            record = {
                "name": name,
                "demangled": demangle(name),
                "address": func.start_ea,
                "size": func.end_ea - func.start_ea,
                "signature": get_signature(func),
                "asm": export_asm(func),
                "hex": export_hex(func),
                "calls": export_calls(func),
                "pseudocode": export_pseudocode(cfunc),
                "members": export_members(cfunc),
            }
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
            if count % 1000 == 0:
                print("[export] %d functions" % count)

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

    print("[export] wrote %d functions to %s" % (count, ndjson_path))
    try:
        import ida_pro

        ida_pro.qexit(0)
    except Exception:
        idaapi.qexit(0)


main()

