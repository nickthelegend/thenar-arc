"""A stand-in for the AS5600 leader firmware (firmware/thenar, ROLE_LEADER=1),
on a pseudo-terminal, so the leader's serial path can be tested without the
ESP32 and its six encoders.

  python3 test/fake-leader.py POSES.json [--calibrated]

Prints the pty path first. Speaks what thenar.ino speaks, at 115200-baud
line rate and 50 Hz: the banner, `RAW r0..r5` until zeroed, `L q0..q5` after,
and takes ZERO, SIGN <j> <±1> and FORGET on the pty.

POSES.json is a list of six-degree poses (the joint angles a hand would put
the leader through). It holds the first pose until a line `GO` arrives on
stdin, plays the list at 50 Hz, then holds the last pose. `--calibrated`
starts already zeroed, as a leader calibrated on an earlier day would.
"""
import json, os, sys, time, tty, select

HOME = [0, -25, 35, 0, 0, 20]
poses = json.load(open(sys.argv[1]))
calibrated = "--calibrated" in sys.argv
signs = [1] * 6
# The encoders' counts at the home pose, as an uncalibrated leader reports them.
zero_counts = [1024, 2210, 3000, 512, 1800, 400]

master, slave = os.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
os.write(master, b"THENAR AS5600 LEADER L1\n")

i, playing, buf, tick = 0, False, b"", time.monotonic()
while True:
    r, _, _ = select.select([master, sys.stdin], [], [], 0.005)
    if sys.stdin in r:
        l = sys.stdin.readline()
        if not l:
            break
        if l.strip() == "GO":
            playing, i = True, 0
    if master in r:
        buf += os.read(master, 4096)
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            cmd = line.decode().strip()
            print(f"< {cmd}", flush=True)
            if cmd == "ZERO":
                calibrated = True
                os.write(master, b"ZERO saved at displayed home pose\n")
            elif cmd.startswith("SIGN "):
                _, j, s = cmd.split()
                signs[int(j)] = int(s)
                os.write(master, b"SIGN saved\n")
            elif cmd == "FORGET":
                calibrated = False
                os.write(master, b"RAW mode\n")
    now = time.monotonic()
    if now - tick < 0.02:
        continue
    tick = now
    q = poses[min(i, len(poses) - 1)] if playing else poses[0]
    if playing:
        i += 1
    if calibrated:
        out = "L " + " ".join(f"{HOME[k] + signs[k] * (q[k] - HOME[k]):.3f}" for k in range(6))
    else:
        out = "RAW " + " ".join(str(int(zero_counts[k] + (q[k] - HOME[k]) * 4096 / 360) % 4096) for k in range(6))
    os.write(master, (out + "\n").encode())
