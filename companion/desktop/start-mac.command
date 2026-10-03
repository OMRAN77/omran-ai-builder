#!/bin/bash
cd "$(dirname "$0")"
python3 -m pip install -q --user -r requirements.txt
python3 omran_device.py "$@"
