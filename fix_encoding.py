#!/usr/bin/env python3
"""Fix UTF-8 replacement chars (U+FFFD) in index.html using temp_git.html as reference."""

REPL = '\ufffd'  # U+FFFD replacement character
EXTRA_CHARS = set(' .,;:!-_()[]{}"<>/=+@#%^&*|~`\'')

with open('index.html', encoding='utf-8') as f:
    content = f.read()

with open('temp_git.html', encoding='utf-8') as f:
    reference = f.read()

parts = content.split(REPL)
print(f'Broken chars to fix: {len(parts)-1}')
result = [parts[0]]
fixed = 0
failed = 0
failed_contexts = []

for idx, after in enumerate(parts[1:]):
    before_text = result[-1]

    # Get trailing context (up to 40 readable chars before the broken char)
    pre = ''
    for ch in reversed(before_text):
        if ch.isalnum() or ch in EXTRA_CHARS:
            pre = ch + pre
            if len(pre) >= 40:
                break
        else:
            break  # stop at non-ASCII or other special char

    # Get leading context (up to 40 readable chars after the broken char)
    suf = ''
    for ch in after:
        if ch.isalnum() or ch in EXTRA_CHARS:
            suf += ch
            if len(suf) >= 40:
                break
        else:
            break

    found_char = None
    # Strategy: find prefix in reference, check what non-ASCII char follows,
    # then verify the suffix is right after that char.
    for pre_len in range(min(30, len(pre)), 2, -1):
        prefix = pre[-pre_len:]
        start = 0
        while True:
            ref_idx = reference.find(prefix, start)
            if ref_idx == -1:
                break
            char_pos = ref_idx + len(prefix)
            if char_pos < len(reference) and ord(reference[char_pos]) > 127:
                candidate = reference[char_pos]
                after_pos = char_pos + 1
                # Verify suffix matches after the candidate char
                for suf_len in range(min(20, len(suf)), 0, -1):
                    suffix = suf[:suf_len]
                    if reference[after_pos:after_pos + len(suffix)] == suffix:
                        found_char = candidate
                        break
                if found_char:
                    break
            start = ref_idx + 1
        if found_char:
            break

    if found_char:
        result.append(found_char)
        fixed += 1
    else:
        result.append(REPL)
        failed += 1
        failed_contexts.append((pre[-20:], after[:20]))

    result.append(after)

print(f'Fixed: {fixed}, Failed: {failed}')
if failed_contexts:
    print('Failed contexts (context around unfixed chars):')
    for pre, suf in failed_contexts[:20]:
        print(f'  ...{repr(pre)} [?] {repr(suf)}...')

final = ''.join(result)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(final)
print('Saved index.html')
