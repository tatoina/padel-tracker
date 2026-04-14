#!/usr/bin/env python3
"""
Fix remaining corrupted characters in index.html
"""

with open("index.html", encoding="utf-8") as f:
    content = f.read()

# Dictionary of corrupted text patterns and their replacements
replacements = {
    'M\ufffdnimo': 'Mínimo',
    '\ufffdnete': 'Únete',
    ' \ufffd t\ufffd': ' — tú',
    'a\ufffdн': 'aún',
    'est\ufffdн': 'están',
    '... \ufffd': '...',
    '\ufffdQuitar': '¿Quitar',
    'borrar\ufffd': 'borrarán',
    'a\ufffdadido': 'añadido',
    '\ufffd': '-',  # El símbolo � en muchos contextos se ve como un guion o dash
}

for old, new in replacements.items():
    count = content.count(old)
    if count > 0:
        content = content.replace(old, new)
        print(f"Fixed {count} occurrences of '{old}' → '{new}'")

with open("index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("\nDone! All remaining corrupted characters fixed.")

