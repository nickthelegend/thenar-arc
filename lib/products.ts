/**
 * What ThenarLabs has built and is building, from its own repositories.
 *
 * Every figure and every picture here is the repository's own: its README,
 * its CAD renders, its simulation captures. Status says plainly what a thing
 * is: live, open hardware that has not been proven on a bench yet, or still
 * being built.
 */
export type ProductStatus = "Live" | "Shipped" | "Open hardware" | "Building" | "In design";

export type ProductImage = { src: string; caption: string; wide?: boolean };

export type Product = {
  id: string;
  name: string;
  kind: string;
  status: ProductStatus;
  line: string;
  body: string;
  facts: string[];
  /** GitHub owner/name. */
  repo: string;
  /** A path inside the repo worth opening first, when there is one. */
  repoPath?: string;
  /** Where to use it in the Thenar app, when it can be used. */
  href?: string;
  hrefLabel?: string;
  /** Real pictures from the repo, the first is the cover. */
  images: ProductImage[];
  /** A GLB in public/products/, when the model exists. */
  model?: string;
  /** A render of the model, for a product with no pictures of its own yet. */
  poster?: string;
  /** The model was exported from CAD with Z up; the viewer stands it upright. */
  zUp?: boolean;
};

export const PRODUCTS: Product[] = [
  {
    id: "thenar",
    name: "Thenar",
    kind: "The data foundry",
    status: "Live",
    line: "People teach robots, and get paid on Monad for every run they record.",
    body:
      "An operator drives a robot arm on a task someone funded. A verifier measures the run against the goal and signs the score, and one Monad transaction records the trajectory and pays the operator in the same block. Every paid run issues the operator a share of the corpus, and AI agents buy each task's data over x402, with every sale logged on chain beside the hash of what was served.",
    facts: ["Live on Monad testnet", "Passkeys checked by the P-256 precompile", "Agents pay per pull over x402", "12 contracts, read live"],
    repo: "nickthelegend/thenar-monad",
    href: "/",
    hrefLabel: "Open the app",
    images: [
      { src: "/products/thenar/station.webp", caption: "The station: an SO-101 task, ready to record", wide: true },
      { src: "/products/thenar/demo.webp", caption: "A run, from the first frame to the payout", wide: true },
    ],
    model: "/products/so101-follower.glb",
  },
  {
    id: "quest",
    name: "Quest capture",
    kind: "Teleoperation on a Meta Quest 3S",
    status: "Live",
    line: "Drive the arm from a Meta Quest 3S, on your own table.",
    body:
      "Every task's station opens in the headset. In mixed reality the bench sits on your real table; take hold of the arm with the grip, close the jaws with the trigger, and the tool follows your hand millimetre for millimetre. The run records in the same shape as one driven from a keyboard or from a leader arm.",
    facts: ["WebXR, no app to install", "Hand tracking or controllers", "Same recording as the browser"],
    repo: "nickthelegend/thenar-monad",
    repoPath: "components/station",
    href: "/station/0",
    hrefLabel: "Open a station",
    images: [
      { src: "/products/thenar/station.webp", caption: "Open any station in the Quest browser and press Enter on your table", wide: true },
    ],
    model: "/products/quest-3s.glb",
  },
  {
    id: "arms",
    name: "Thenar Arms",
    kind: "SO-101 leader and follower",
    status: "Open hardware",
    line: "A robot arm pair you can print: a passive leader and an MG996R follower.",
    body:
      "Derived from the open SO-101. The follower runs on six MG996R servos behind a PCA9685; the leader has no motors at all, six AS5600 magnetic encoders reading where your hand puts each joint. Plug the leader into a computer and it drives the arm in any Thenar task, joint for joint.",
    facts: ["6 MG996R servos, ESP32 + PCA9685", "6 AS5600 encoders, ESP32 + TCA9548A", "Print files for a Bambu P1S", "Drives Thenar over USB"],
    repo: "nickthelegend/thenar-arms",
    repoPath: "so101-mg996r",
    href: "/spec/so101",
    hrefLabel: "Drive it in the browser",
    images: [
      { src: "/products/arms/assembly.webp", caption: "Both CAD assemblies: the MG996R follower R3 and the AS5600 leader L1", wide: true },
      { src: "/products/arms/follower.webp", caption: "Follower R3 at home, in SolidWorks" },
      { src: "/products/arms/leader.webp", caption: "Leader L1 at home, in SolidWorks" },
      { src: "/products/arms/leader-render.webp", caption: "The leader's handle and trigger" },
      { src: "/products/arms/encoder-exploded.webp", caption: "One encoder cartridge, exploded" },
      { src: "/products/arms/print-plates.webp", caption: "Print layouts for a Bambu P1S" },
      { src: "/products/arms/wiring.webp", caption: "Wiring on one ESP32" },
    ],
    model: "/products/so101-follower.glb",
  },
  {
    id: "hotaru",
    name: "Hotaru",
    kind: "Open source desk robot",
    status: "Shipped",
    line: "An animated desk lamp that sees, hears and moves.",
    body:
      "Four MG996R joints on a turntable base, a cone shade with a WS2812 ring for an eye, an I2S microphone and speaker, driven by an ESP32-S3. Hotaru 3 is the SolidWorks rebuild: a shoulder geared 1.8 to 1, box-section links, M3 bolts throughout, a PCA9685 driving all four servos, and every servo under a third of stall across its whole range.",
    facts: ["4 MG996R joints, ESP32-S3", "WS2812 eye, I2S mic and speaker", "5 plates for a P1S", "Every servo under 1/3 of stall"],
    repo: "nickthelegend/hotaru",
    images: [
      { src: "/products/hotaru/hero.webp", caption: "Hotaru" },
      { src: "/products/hotaru/poses.webp", caption: "Hotaru 3's poses, checked in SolidWorks", wide: true },
      { src: "/products/hotaru/curious.webp", caption: "Curious" },
      { src: "/products/hotaru/reach.webp", caption: "Reach" },
      { src: "/products/hotaru/look-up.webp", caption: "Look up" },
      { src: "/products/hotaru/shy.webp", caption: "Shy" },
    ],
    model: "/products/hotaru.glb",
  },
  {
    id: "band",
    name: "Thenar Band",
    kind: "Contact capture",
    status: "In design",
    line: "A wrist unit that records how hard a hand grips, not just where it goes.",
    body:
      "Worn while you do ordinary work: vision, inertial and pressure across the thenar eminence and the fingertips, sampled against one clock in the device rather than aligned in software afterwards. Four printed parts: a C-shaped cuff that springs over the wrist, a vented bay under a snap-fit cap, a camera on a three-lug bayonet that twists 60 degrees to a hard stop, and a pressure pad on a compliant arm that stays loaded as the thumb opposes.",
    facts: ["Bore 58 × 46 mm", "Bayonet 3 × 34°, 60° twist", "Watertight CAD, not yet worn"],
    repo: "nickthelegend/thenar-avax",
    images: [],
    model: "/products/band.glb",
    poster: "/products/band.webp",
  },
  {
    id: "jx1",
    name: "JX1",
    kind: "Humanoid",
    status: "Building",
    line: "A full-size walking humanoid designed to be built in India.",
    body:
      "1.23 m tall, 33.6 kg, 23 joints, walking at 0.5 to 0.8 m/s in simulation. Full CAD, strength analysis, a parts list with Indian suppliers, wiring, firmware, simulation and a trained walking controller, all in one repository, for about ₹7.1 lakh in parts.",
    facts: ["1.23 m, 33.6 kg, 23 joints", "Trained walking controller", "≈ ₹7.1 lakh in parts"],
    repo: "nickthelegend/thenar-jx1",
    images: [
      { src: "/products/jx1/hero.webp", caption: "JX1, assembled", wide: true },
      { src: "/products/jx1/walking.webp", caption: "Walking in simulation" },
      { src: "/products/jx1/front.webp", caption: "From the front" },
      { src: "/products/jx1/back.webp", caption: "From behind" },
      { src: "/products/jx1/exploded.webp", caption: "Exploded" },
      { src: "/products/jx1/cover.webp", caption: "Front and back, rendered from the CAD" },
    ],
    model: "/products/jx1.glb",
  },
  {
    id: "jx0",
    name: "JX0",
    kind: "Small humanoid",
    status: "Building",
    line: "The humanoid you can build now, for under ₹50,000.",
    body:
      "52 cm tall and printed in PETG, with hobby servos and a Raspberry Pi. It walks, talks, shows a face on a round screen and uses two gripper hands. Same pipeline as JX1: CAD built by script, servo sizing checked, 14 of 14 walking gaits passing in simulation.",
    facts: ["52 cm, PETG", "₹47,106 in parts", "14 of 14 gaits pass in simulation"],
    repo: "nickthelegend/thenar-jx1",
    repoPath: "jx0",
    images: [
      { src: "/products/jx0/cover.webp", caption: "JX0 in SolidWorks, and the simulated robot holding out its gripper hand", wide: true },
      { src: "/products/jx0/walk.webp", caption: "Walking forward in simulation" },
      { src: "/products/jx0/demo.webp", caption: "The demo" },
    ],
    model: "/products/jx0.glb",
  },
  {
    id: "duck",
    name: "Thenar Duck",
    kind: "Bipedal companion",
    status: "Building",
    line: "A 14-servo duck robot, printed on a P1S in four colours.",
    body:
      "A Raspberry Pi 4B, a 3S battery, a separately mounted BNO055 and removable electronics trays, with serviceable lights. 94 print objects across 19 plates, from a fit-test plate first.",
    facts: ["14 servos, Raspberry Pi 4B", "BNO055 IMU", "94 print objects, 19 plates"],
    repo: "nickthelegend/thenar-duck",
    images: [
      { src: "/products/duck/assembled.webp", caption: "Revision B, assembled", wide: true },
      { src: "/products/duck/covers-removed.webp", caption: "Covers removed" },
      { src: "/products/duck/electronics.webp", caption: "Electronics access" },
      { src: "/products/duck/service.webp", caption: "Service layout" },
      { src: "/products/duck/plates.webp", caption: "All 19 P1S plates" },
    ],
    model: "/products/thenar-duck.glb",
  },
  {
    id: "gt240",
    name: "GT240",
    kind: "Sim racing wheel",
    status: "Open hardware",
    line: "A printable 240 mm Formula-style simulator wheel, engraved ThenarLabs.",
    body:
      "An AS5600 magnetic angle sensor on an 8 mm steel shaft, a rear ESP32 enclosure, a standard servo bay and twin haptic motor mounts. Six prepared P1S plates: a calibration coupon first, then five production plates, about 30 hours and 870 g of PETG.",
    facts: ["240 mm, AS5600 + 8 mm shaft", "ESP32 enclosure, haptic mounts", "6 P1S plates, 870 g PETG"],
    repo: "nickthelegend/racingwheel",
    images: [
      { src: "/products/wheel/wheel.webp", caption: "The GT240 R2 wheel", wide: true },
      { src: "/products/wheel/backend.webp", caption: "The rear electronics enclosure", wide: true },
      { src: "/products/wheel/plates.webp", caption: "All six P1S plates", wide: true },
    ],
  },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

export const repoUrl = (p: Product) =>
  `https://github.com/${p.repo}${p.repoPath ? `/tree/main/${p.repoPath}` : ""}`;
