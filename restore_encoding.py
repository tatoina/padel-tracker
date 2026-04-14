#!/usr/bin/env python3
"""
Restore corrupted emojis (??) and accented chars (ï¿½) in index.html
using temp_git.html as a reference where available.
All new/missing emoji/accent references are handled with hardcoded maps.
"""
import re

with open("index.html", encoding="utf-8") as f:
    content = f.read()

with open("temp_git.html", encoding="utf-8") as f:
    git = f.read()

# ── 1. EMOJI RESTORATION ──────────────────────────────────────────────────────
# Every 4-byte UTF-8 emoji was replaced with "??" (two question marks).
# We restore by exact surrounding-context matching against the git file.
# Pattern: capture up to 30 ASCII chars before and after each ??

def restore_by_context(text, reference):
    """Replace ?? sequences using context-matching against reference."""
    result = []
    i = 0
    replacements_made = 0
    while i < len(text):
        if text[i] == '?' and i + 1 < len(text) and text[i+1] == '?':
            # Check if this is a double-? that should be an emoji
            # Get prefix (last 30 printable ASCII chars before this position)
            pre_start = max(0, i - 40)
            pre = text[pre_start:i]
            # Get suffix (next 30 ASCII chars after ??)
            post_end = min(len(text), i + 2 + 40)
            post = text[i+2:post_end]
            
            # Search reference for the same context
            found = False
            for pre_len in range(min(30, len(pre)), 3, -1):
                prefix = pre[-pre_len:]
                if not prefix.isprintable() or '?' in prefix:
                    continue
                ref_idx = reference.find(prefix)
                if ref_idx == -1:
                    continue
                # Found prefix in reference - get what's at that position
                ref_pos = ref_idx + len(prefix)
                if ref_pos < len(reference):
                    ref_char = reference[ref_pos]
                    # Validate it looks like an emoji (non-ASCII, non-alphanumeric)
                    if ord(ref_char) > 127:
                        result.append(prefix[-pre_len + pre_len:] if False else '')
                        # Remove the pre we already added
                        result.append(ref_char)
                        # Check if next char in reference is also non-ASCII (some emojis have variation selectors)
                        if ref_pos + 1 < len(reference) and ord(reference[ref_pos+1]) > 0xFE00 and ord(reference[ref_pos+1]) <= 0xFE0F:
                            result.append(reference[ref_pos+1])
                        i += 2
                        found = True
                        replacements_made += 1
                        break
            if not found:
                result.append(text[i])
                i += 1
        else:
            result.append(text[i])
            i += 1
    print(f"  Emoji restorations: {replacements_made}")
    return ''.join(result)

# ── 2. ACCENT RESTORATION ─────────────────────────────────────────────────────
# Every accented char became "ï¿½" (the 3-char sequence ï + ¿ + ½).
# We use context matching to find the correct char from git.

BROKEN_ACCENT = 'ï¿½'  # This is U+00EF + U+00BF + U+00BD

def restore_accents(text, reference):
    """Replace ï¿½ sequences using context-matching against reference."""
    # Build index of all Spanish words with accents for quick lookup
    # First pass: collect all (prefix, correct_char, suffix) from reference
    
    parts = text.split(BROKEN_ACCENT)
    if len(parts) == 1:
        print("  No accented chars to restore")
        return text
    
    result = [parts[0]]
    restorations = 0
    failures = 0
    
    for idx, after in enumerate(parts[1:]):
        before = result[-1]  # all text accumulated so far
        
        # Get up to 30 trailing ASCII chars from 'before'
        pre = ''
        for ch in reversed(before):
            if ord(ch) < 128 and ch.isalnum() or ch in ' .,;:!?-_()[]{}"\'/\\':
                pre = ch + pre
                if len(pre) >= 30:
                    break
            else:
                break  # stop at non-ASCII (another accent/emoji)
        
        # Get up to 30 leading ASCII chars from 'after'
        suf = ''
        for ch in after:
            if ord(ch) < 128 and (ch.isalnum() or ch in ' .,;:!?-_()[]{}"\'/\\<>=+'):
                suf += ch
                if len(suf) >= 30:
                    break
            else:
                break
        
        found_char = None
        # Try progressively shorter context until we find a match
        for pre_len in range(min(25, len(pre)), 2, -1):
            prefix = pre[-pre_len:]
            for suf_len in range(min(15, len(suf)), 0, -1):
                suffix = suf[:suf_len]
                pattern = prefix + suffix
                ref_idx = reference.find(pattern)
                if ref_idx != -1:
                    # The accent char should be between prefix and suffix
                    char_pos = ref_idx + len(prefix)
                    if char_pos < len(reference) and ord(reference[char_pos]) > 127:
                        found_char = reference[char_pos]
                        break
            if found_char:
                break
        
        if found_char:
            result.append(found_char)
            restorations += 1
        else:
            # Fallback: leave as ï¿½ with a marker comment for manual review
            result.append(BROKEN_ACCENT)
            failures += 1
        
        result.append(after)
    
    print(f"  Accent restorations: {restorations}, failures: {failures}")
    return ''.join(result)

print("Step 1: Restoring emojis...")
content = restore_by_context(content, git)

print("Step 2: Restoring accented characters...")
content = restore_accents(content, git)

# ── 3. HARDCODED FIXES for new text not in git ───────────────────────────────
# Text added during this session that isn't in the git reference
hardcoded = [
    # New UI strings added in this session
    ('Aï¿½adir usuario registrado', 'Añadir usuario registrado'),
    ('Aï¿½adir sin cuenta', 'Añadir sin cuenta'),
    ('ï¿½nete', 'únete'),
    ('ï¿½nase', 'únase'),
    ('Selecciona un grupo', 'Selecciona un grupo'),  # no accent, already fine
    ('Jugadores del grupo', 'Jugadores del grupo'),  # no accent, fine
    ('Zona peligrosa', 'Zona peligrosa'),              # no accent, fine
]

for broken, fixed in hardcoded:
    if broken in content:
        content = content.replace(broken, fixed)
        print(f"  Hardcoded fix: '{broken}' → '{fixed}'")

# ── 4. WRITE OUTPUT ───────────────────────────────────────────────────────────
with open("index.html", "w", encoding="utf-8") as f:
    f.write(content)

# Count remaining broken sequences
remaining_qq = content.count('??')
remaining_accent = content.count(BROKEN_ACCENT)
print(f"\nDone! Remaining ?? : {remaining_qq}, remaining ï¿½ : {remaining_accent}")
