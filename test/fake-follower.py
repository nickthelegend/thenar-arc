"""A stand-in for the MG996R follower firmware (firmware/thenar, ROLE_LEADER=0),
on a pseudo-terminal, so the relay's serial path can be tested without an ESP32.

Prints the pty path first, then every line the relay sends it. Replies the way
thenar.ino does: ARM is refused unless the last target was within 3° of home.
"""
import os, sys, tty, select

HOME = [0, -25, 35, 0, 0, 20]
master, slave = os.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
buf = b""
goal = None
os.write(master, b"THENAR MG996R FOLLOWER R3 DISARMED\n")
while True:
    r, _, _ = select.select([master, sys.stdin], [], [], 1)
    if sys.stdin in r and not sys.stdin.readline():
        break
    if master not in r:
        continue
    buf += os.read(master, 4096)
    while b"\n" in buf:
        line, buf = buf.split(b"\n", 1)
        line = line.decode().strip()
        print(line, flush=True)
        if line == "STOP":
            os.write(master, b"STOP user\n")
        elif line == "ARM":
            ok = goal is not None and all(abs(g - h) <= 3 for g, h in zip(goal, HOME))
            os.write(master, b"ARMED\n" if ok else b"STOP home_pose_required\n")
        elif line.startswith("Q "):
            goal = [float(x) for x in line.split()[1:]]
