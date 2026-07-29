#!/usr/bin/env python3
"""
Convert ChessNotR PGN timing comments to PGN %clk comments.

Input PGNs from ChessNotR often contain elapsed-move-time comments like:
    {[%emt 0:01:23]}

Some moves may also have a bare clock reading, such as:
    {1:07:00} or {56:00}

This script creates a new PGN with one clock comment after every move:
    {[%clk h:mm:ss]}

It removes %emt comments, treats bare clock comments as authoritative anchors,
updates the TimeControl header to standard PGN notation, and formats movetext
as one full move per row.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Iterable

RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}

HEADER_RE = re.compile(r'^\[(\w+)\s+"(.*)"\]\s*$')
MOVE_NUMBER_RE = re.compile(r'^(\d+)\.(\.\.)?$')
TOKEN_RE = re.compile(r'\{[^}]*\}|\S+')
EMT_RE = re.compile(r'%emt\s+([0-9]+:[0-9]{1,2}:[0-9]{1,2})')
CLK_RE = re.compile(r'%clk\s+([0-9]+(?::[0-9]{1,2}){1,2})')
BARE_CLOCK_RE = re.compile(r'^\s*([0-9]+(?::[0-9]{1,2}){1,2})\s*$')


@dataclass
class Move:
    number: int
    color: str  # "w" or "b"
    san: str
    emt_seconds: Optional[int] = None
    anchor_clock_seconds: Optional[int] = None
    clk_seconds: Optional[int] = None


@dataclass
class TimeControl:
    start_seconds: int
    mode: str  # "delay", "increment", or "none"
    amount_seconds: int = 0

    def pgn_header_value(self) -> str:
        if self.mode == "delay" and self.amount_seconds:
            return f"{self.start_seconds}d{self.amount_seconds}"
        if self.mode == "increment" and self.amount_seconds:
            return f"{self.start_seconds}+{self.amount_seconds}"
        return str(self.start_seconds)


def parse_clock_time(value: str, *, bare: bool = False) -> int:
    """Parse h:mm:ss. For bare ChessNotR anchors, mm:ss is also accepted."""
    parts = [int(part) for part in value.strip().split(":")]
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        if bare:
            hours = 0
            minutes, seconds = parts
        else:
            hours, minutes, seconds = 0, parts[0], parts[1]
    else:
        raise ValueError(f"Invalid clock time: {value!r}")
    if minutes >= 60 or seconds >= 60:
        raise ValueError(f"Invalid clock time: {value!r}")
    return hours * 3600 + minutes * 60 + seconds


def format_clock_time(seconds: int) -> str:
    seconds = max(0, int(seconds))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:02d}"


def split_headers_and_movetext(text: str) -> tuple[list[str], str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    header_lines: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("[") and line.endswith("]"):
            header_lines.append(lines[i].strip())
            i += 1
        elif line == "":
            i += 1
            # Continue across blank lines before movetext.
            if i < len(lines) and lines[i].lstrip().startswith("["):
                continue
            break
        else:
            break
    movetext = "\n".join(lines[i:]).strip()
    return header_lines, movetext


def header_dict(header_lines: Iterable[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in header_lines:
        match = HEADER_RE.match(line.strip())
        if match:
            headers[match.group(1)] = match.group(2)
    return headers


def parse_timecontrol_header(value: str) -> Optional[TimeControl]:
    """Parse common ChessNotR and standard PGN TimeControl values."""
    raw = value.strip().replace(" ", "")

    # ChessNotR-style examples: G70/d10, G70/d10, G90+30
    match = re.fullmatch(r'G(\d+)(?:/?d(\d+)|\+(\d+))?', raw, flags=re.IGNORECASE)
    if match:
        start_seconds = int(match.group(1)) * 60
        if match.group(2):
            return TimeControl(start_seconds, "delay", int(match.group(2)))
        if match.group(3):
            return TimeControl(start_seconds, "increment", int(match.group(3)))
        return TimeControl(start_seconds, "none", 0)

    # Standard delay notation: 4200d10
    match = re.fullmatch(r'(\d+)d(\d+)', raw, flags=re.IGNORECASE)
    if match:
        return TimeControl(int(match.group(1)), "delay", int(match.group(2)))

    # Standard increment notation: 5400+30
    match = re.fullmatch(r'(\d+)\+(\d+)', raw)
    if match:
        return TimeControl(int(match.group(1)), "increment", int(match.group(2)))

    # Plain sudden-death seconds.
    if raw.isdigit():
        return TimeControl(int(raw), "none", 0)

    return None


def resolve_timecontrol(headers: dict[str, str], args: argparse.Namespace) -> TimeControl:
    detected = parse_timecontrol_header(headers.get("TimeControl", "")) if headers.get("TimeControl") else None

    start_seconds: Optional[int] = None
    if args.start_seconds is not None:
        start_seconds = args.start_seconds
    elif args.start_minutes is not None:
        start_seconds = args.start_minutes * 60
    elif detected:
        start_seconds = detected.start_seconds

    if start_seconds is None:
        raise SystemExit(
            "Could not determine starting clock time. Add --start-minutes 70 "
            "or --start-seconds 4200."
        )

    if args.delay is not None and args.increment is not None:
        raise SystemExit("Use either --delay or --increment, not both.")

    if args.delay is not None:
        return TimeControl(start_seconds, "delay", args.delay)
    if args.increment is not None:
        return TimeControl(start_seconds, "increment", args.increment)
    if detected:
        return TimeControl(start_seconds, detected.mode, detected.amount_seconds)
    return TimeControl(start_seconds, "none", 0)


def comment_text(token: str) -> str:
    return token[1:-1].strip()


def is_comment(token: str) -> bool:
    return token.startswith("{") and token.endswith("}")


def is_move_number(token: str) -> Optional[tuple[int, str]]:
    match = MOVE_NUMBER_RE.match(token)
    if not match:
        return None
    move_no = int(match.group(1))
    side = "b" if match.group(2) else "w"
    return move_no, side


def extract_timing_from_comments(comment_tokens: list[str]) -> tuple[Optional[int], Optional[int]]:
    """
    Return (emt_seconds, anchor_clock_seconds).

    Bare comments like {56:00} and existing [%clk ...] comments are treated as
    authoritative clock anchors. If both an elapsed time and an anchor appear
    after the same SAN move, the anchor wins for the final clock value.
    """
    emt_seconds: Optional[int] = None
    anchor_clock_seconds: Optional[int] = None

    for token in comment_tokens:
        text = comment_text(token)

        emt_match = EMT_RE.search(text)
        if emt_match:
            emt_seconds = parse_clock_time(emt_match.group(1))

        clk_match = CLK_RE.search(text)
        if clk_match:
            anchor_clock_seconds = parse_clock_time(clk_match.group(1), bare=True)

        bare_match = BARE_CLOCK_RE.match(text)
        if bare_match:
            anchor_clock_seconds = parse_clock_time(bare_match.group(1), bare=True)

    return emt_seconds, anchor_clock_seconds


def parse_moves(movetext: str) -> tuple[list[Move], Optional[str]]:
    tokens = TOKEN_RE.findall(movetext)
    moves: list[Move] = []
    result: Optional[str] = None

    current_number = 1
    side_to_move = "w"
    i = 0

    while i < len(tokens):
        token = tokens[i]

        if is_comment(token):
            # A standalone comment that was not attached to a SAN move.
            i += 1
            continue

        if token in RESULT_TOKENS:
            result = token
            i += 1
            continue

        move_number = is_move_number(token)
        if move_number:
            current_number, side_to_move = move_number
            i += 1
            continue

        # Skip NAGs, game annotations, or variation parens if they appear.
        # ChessNotR files normally do not contain these, but ignoring them keeps
        # the timing conversion focused on the mainline moves.
        if token.startswith("$") or token in {"(", ")"}:
            i += 1
            continue

        san = token
        comment_tokens: list[str] = []
        i += 1
        while i < len(tokens) and is_comment(tokens[i]):
            comment_tokens.append(tokens[i])
            i += 1

        emt_seconds, anchor_clock_seconds = extract_timing_from_comments(comment_tokens)
        moves.append(
            Move(
                number=current_number,
                color=side_to_move,
                san=san,
                emt_seconds=emt_seconds,
                anchor_clock_seconds=anchor_clock_seconds,
            )
        )

        if side_to_move == "w":
            side_to_move = "b"
        else:
            side_to_move = "w"
            current_number += 1

    return moves, result


def apply_time_rule(previous_clock: int, emt_seconds: int, tc: TimeControl) -> int:
    """
    Apply the user's ChessNotR conversion rule.

    Delay mode: if elapsed time is within the delay, clock is unchanged;
    otherwise subtract the full elapsed time.

    Increment mode: if elapsed time is within the increment, add the unused
    increment; otherwise subtract the full elapsed time.
    """
    if tc.mode == "delay" and tc.amount_seconds:
        if emt_seconds <= tc.amount_seconds:
            return previous_clock
        return previous_clock - emt_seconds

    if tc.mode == "increment" and tc.amount_seconds:
        if emt_seconds <= tc.amount_seconds:
            return previous_clock + (tc.amount_seconds - emt_seconds)
        return previous_clock - emt_seconds

    return previous_clock - emt_seconds


def calculate_clocks(moves: list[Move], tc: TimeControl) -> list[str]:
    clocks = {"w": tc.start_seconds, "b": tc.start_seconds}
    warnings: list[str] = []

    for move in moves:
        if move.anchor_clock_seconds is not None:
            move.clk_seconds = move.anchor_clock_seconds
        elif move.emt_seconds is not None:
            move.clk_seconds = apply_time_rule(clocks[move.color], move.emt_seconds, tc)
        else:
            move.clk_seconds = clocks[move.color]
            warnings.append(
                f"Move {move.number}{'.' if move.color == 'w' else '...'} {move.san} "
                "had no %emt or clock anchor; reused previous clock."
            )

        clocks[move.color] = max(0, move.clk_seconds)
        move.clk_seconds = clocks[move.color]

    return warnings


def update_timecontrol_header(header_lines: list[str], value: str) -> list[str]:
    updated: list[str] = []
    replaced = False
    for line in header_lines:
        if line.startswith("[TimeControl "):
            updated.append(f'[TimeControl "{value}"]')
            replaced = True
        else:
            updated.append(line)
    if not replaced:
        # Put TimeControl near the normal PGN event metadata if it was absent.
        insert_at = min(5, len(updated))
        updated.insert(insert_at, f'[TimeControl "{value}"]')
    return updated


def format_movetext(moves: list[Move], result: Optional[str]) -> str:
    rows: list[str] = []
    i = 0
    while i < len(moves):
        move = moves[i]
        if move.color == "w":
            row = f"{move.number}. {move.san} {{[%clk {format_clock_time(move.clk_seconds or 0)}]}}"
            if i + 1 < len(moves) and moves[i + 1].number == move.number and moves[i + 1].color == "b":
                black = moves[i + 1]
                row += f" {black.san} {{[%clk {format_clock_time(black.clk_seconds or 0)}]}}"
                i += 2
            else:
                i += 1
        else:
            row = f"{move.number}... {move.san} {{[%clk {format_clock_time(move.clk_seconds or 0)}]}}"
            i += 1
        rows.append(row)

    if result:
        if rows:
            rows[-1] += f" {result}"
        else:
            rows.append(result)

    return "\n".join(rows)


def convert_pgn(text: str, args: argparse.Namespace) -> tuple[str, list[str]]:
    header_lines, movetext = split_headers_and_movetext(text)
    headers = header_dict(header_lines)
    tc = resolve_timecontrol(headers, args)
    moves, parsed_result = parse_moves(movetext)
    warnings = calculate_clocks(moves, tc)

    result = parsed_result or headers.get("Result")
    header_lines = update_timecontrol_header(header_lines, args.timecontrol or tc.pgn_header_value())
    output = "\n".join(header_lines).strip() + "\n\n" + format_movetext(moves, result).strip() + "\n"
    return output, warnings


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(input_path.stem + "_clk_only.pgn")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert ChessNotR %emt PGN comments to %clk comments."
    )
    parser.add_argument("input", type=Path, help="Input PGN file")
    parser.add_argument("-o", "--output", type=Path, help="Output PGN file")
    parser.add_argument("--start-minutes", type=int, help="Starting clock time in minutes, e.g. 70")
    parser.add_argument("--start-seconds", type=int, help="Starting clock time in seconds, e.g. 4200")
    parser.add_argument("--delay", type=int, help="Delay seconds per move, e.g. 10")
    parser.add_argument("--increment", type=int, help="Increment seconds per move, e.g. 30")
    parser.add_argument(
        "--timecontrol",
        help="Explicit output TimeControl header value, e.g. 4200d10 or 5400+30",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print warnings about moves with missing timing data",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if not args.input.exists():
        parser.error(f"Input file not found: {args.input}")

    output_path = args.output or default_output_path(args.input)
    text = args.input.read_text(encoding="utf-8-sig")
    converted, warnings = convert_pgn(text, args)
    output_path.write_text(converted, encoding="utf-8")

    if args.verbose:
        for warning in warnings:
            print(f"warning: {warning}", file=sys.stderr)

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
