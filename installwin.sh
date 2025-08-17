#!/bin/bash
dest="/mnt/c/Users/Klaus/Documents/Schuelerbeobachtungen"

find . -type f -name "*.exe" -printf '%h\n' | sort -u | while read dir; do
    cp -r "$dir" "$dest"
done