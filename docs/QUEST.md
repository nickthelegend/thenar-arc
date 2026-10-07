# The station in a headset, and tasks scanned from a real table

## A Quest 3 / 3S on the station

In the Quest browser, open `app.thenar.io/q/<task>` (for example `app.thenar.io/q/0`).
That is the station for the task with **Drive with: Quest 3S** already chosen. On a
laptop, the same panel shows the link to type into the headset.

- **Put it on my table**: mixed reality. Point the right controller at your real
  table: a ring shows where the arm will stand, and the bench follows it. Pull the
  trigger to set it down. With hands instead of controllers, look at the table and
  pinch. If the headset has not scanned your room it finds no surface; after a
  moment the trigger keeps the bench where it already stands. Running Space Setup
  once fixes that.
- **Enter in VR**: the modelled room, with the bench brought in front of you.

In mixed reality only the arm, the task's objects and the goal ring are drawn, and
their shadows fall on your real table. The modelled room and plate are hidden.

| Controller | |
|---|---|
| **Grip** (hold) | take hold of the arm: the tool follows your hand, millimetre for millimetre |
| **Trigger** | close the jaws, as far as it is pulled (the pull that placed the arm does not count) |
| **A** (or **X**) | begin a run, or end the one in progress |
| **B** | pick the arm up and place it again |
| **Stick** | nudge the tool one axis at a time |

| Hands | |
|---|---|
| **Left pinch** (hold) | take hold of the arm; it follows your right hand |
| **Right thumb to index** | the jaws |

The panel beside the bench shows the task, the run and what to press. Take the
headset off to submit: a run is paid from your wallet like any other, after the
same passkey sign-in, and recorded in the same shape as one driven from a keyboard
or a leader arm.

### Reaching a local build from the headset

WebXR needs a secure origin. Over USB, with developer mode on the headset:

```bash
adb reverse tcp:3338 tcp:3338
NEXT_DIST_DIR=.next-quest pnpm exec next build && NEXT_DIST_DIR=.next-quest pnpm exec next start -p 3338
```

Then open `http://localhost:3338/q/0` in the Quest browser. Use a production build:
under `next dev` the station's 3D context can be lost after a few seconds. A
deployed site (HTTPS) needs nothing.

### Testing without a headset

`test/live-station-xr.mjs` (VR) and `test/live-station-mr.mjs` (table placement)
drive the station through Meta's IWER emulator in a headed Chromium:

```bash
IWER=path/to/iwer.bundle.js BASE=https://app.thenar.io TASK=0 node test/live-station-mr.mjs
```

The emulator has no room to scan, so the MR test answers hit tests with a table
0.74 m up and 0.6 m ahead, then checks where the bench stands from the head pose
the renderer is given. Both tests carry a fix for IWER 2.5, whose
`getOffsetReferenceSpace` drops the offset.

## Driving a task with your SO-101 leader (AS5600)

The leader is the arm with no motors: six AS5600 encoders on an ESP32 and a
TCA9548A (thenar-arms, `so101-mg996r/firmware/thenar`, built with
`-DROLE_LEADER=1`). Move it by hand and the SO-101 in the task follows it joint
for joint, and the run records exactly what your hand did.

**On app.thenar.io, with nothing installed** (Chrome or Edge on a computer):

1. Plug the leader into the computer over USB.
2. Open an SO-101 task's station, e.g. `app.thenar.io/station/0`. Under **Your SO-101**, press
   **Drive with my leader arm** and pick the leader's port.
3. The first time only: hold the leader in the home pose (base 0°, shoulder −25°,
   elbow +35°, wrist 0°, roll 0°, jaw 20°) and press **This is home**. The leader
   stores it (`ZERO`). If a joint on screen turns the opposite way to your hand,
   press **reverse** beside it (`SIGN`). Both survive a power cycle.
4. The panel says *Your leader is driving the arm*. Press **Begin run**, do the task
   with the leader (the trigger is the jaws), and submit as usual.

**Through the relay**, with a physical follower copying the same motion:

```bash
node scripts/arm-relay.mjs --leader /dev/cu.usbserial-LEADER --follower /dev/cu.usbserial-FOLLOWER --arm
```

Then press **My leader is on the arm relay** on the station. The relay drives the
follower from the leader directly and forwards the same pose to the page.

`test/live-localnet.mjs` with `DRIVE=leader` checks the whole path on the local
chain: a stand-in for the leader firmware on a pseudo-terminal
(`test/fake-leader.py`), the real relay, the station, the submit, the payout and
the corpus shares, and that every recorded sample is a pose the leader sent.

## Scanning a task from a real table (`/post`)

1. Lay a sheet of A4 flat in front of the arm, long side pointing away, near edge
   centred 9 cm ahead of the base.
2. **Scan with a camera**: start the camera and freeze a frame, or upload a photo.
3. Click the sheet's corners (near left, near right, far right, far left). Every
   object on the table now has a position in millimetres in the arm's frame.
4. The on-device detector (MediaPipe EfficientDet-Lite0, served from this site)
   names what it recognises; click the picture to add anything it missed.
5. Choose **Move** and **Onto**.

The measured positions go into the task's name on chain:

`Put the glass on the plate [scan 199,35 > 309,-52]`

- `lib/scan.ts` parses that tag.
- `lib/bench.ts` `goalFor` / `startFor` read it.
- The station draws the payload where it really stood.
- `/api/sign` scores the run against where its target really is, read from the task on chain, never from the request.
- A task without the tag keeps the bench's shared start and goal, and scores exactly as before.

## Teach and repeat (station sidebar)

- **Teach** learns from the best paid run on the task, fetched through `/api/dataset`: the same export a buyer downloads.
- **Repeat alone** runs the arm by itself. The demonstration is bent to this scene's start and goal (`lib/teach.ts`).
- A repeat is practice only: it is never submitted and never paid.

## The SO-101 (MG996R) as a second arm

The SO-101, built with MG996R servos, is the default arm: every single-arm
task runs on it. A name tagged `[arm thenar6]`, or a task that needs two arms,
runs on the THENAR-6. `/post` writes the tag either way, so a task's arm never
depends on the default. The tag sits next to any scan tag:

`Put the glass on the plate [arm so101] [scan 199,35 > 309,-52]`

- `lib/scan.ts` reads the tags. `lib/hooks.ts` shapes every task into `name`
  (the sentence), `chainName` (the name exactly as stored), `arm` and `scanned`.
  Scoring always reads `chainName`.
- `lib/so101-spec.ts` is the follower chain from thenar-arms' assembly manifest.
  `lib/so101.ts` solves it: damped least squares, gripper down, limits enforced.
  `public/models/so101-mg996r.glb` is built from the same manifest.
- The station draws `components/station/so101-arm.tsx` for an SO-101 task. It
  records the arm's own five joints and the jaw (radians) and its own tool
  position. Grasp, placement and score are the same bench.
- Replays, teach (`lib/teach.ts`) and the coherence check (`lib/coherence.ts`)
  read the joints back through the arm that made them (`lib/embodiment.ts`).
  Dataset exports carry `embodiment`, `arm` and `joint_names`.
- `/spec/so101` is the arm on its own: drive the gripping point and read the
  solved joints.

### Mirroring onto a real SO-101

```bash
node scripts/arm-relay.mjs --follower /dev/cu.usbserial-XXXX --arm
```

Then press **Mirror to my SO-101** on an SO-101 task's station or on
`/spec/so101`.

The relay speaks thenar-arms' firmware protocol: `Q q0 … q5`, `ARM`, `STOP`,
and `L …` from a leader given with `--leader`. It listens on 127.0.0.1 and
refuses pages from other websites. It never arms without `--arm`, and then only
from home. The page holds home, then eases to the pose on screen.

The relay also refuses:

- any pose outside the joint limits
- any pose that would put the gripper or the wrist into the table

It sends STOP when the page stops streaming. `test/arm-relay.test.mjs` checks
all of this against a pseudo-terminal that answers like the firmware
(`test/fake-follower.py`). `test/live-so101.mjs` drives `/spec/so101` in a real
browser through the relay.

## Real props

Seventeen props are photoscans from [Poly Haven](https://polyhaven.com), all
CC0. Their entries in `public/props/index.json` carry a `source` field;
`cad/props.py` leaves those alone when it regenerates the procedural set.
`scripts/real-props.mjs` converts a scan into the props' convention: metres,
Z up, standing on z = 0, centred on its footprint, with 512 px JPEG textures.
The previews on `/post` and `/inventory` are stills drawn by one shared
offscreen renderer (`components/model-stage.tsx`), so the library can grow
without running into the browser's WebGL context limit.
