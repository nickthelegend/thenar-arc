/**
 * The SO-101 (MG996R follower R3) as thenar-arms exports it: joint limits, the
 * home pose, and the bare kinematic chain in millimetres, Z up. Generated from
 * thenar-arms' study-manifest.json (sha256 below); the GLB in
 * public/models/so101-mg996r.glb was built from the same manifest.
 */
export const SO101_SPEC = {
 "embodiment": "SO-101 \u00b7 MG996R follower R3",
 "source": "thenar-arms robot-studio/public/models/so101/study-manifest.json",
 "sourceSha256": "39180f843d327f32dfb736e61015908e7cc5828ca3de39388c488ae88ce45b0e",
 "units": "mm, Z up",
 "jointNames": [
  "Base rotation",
  "Shoulder",
  "Elbow",
  "Wrist pitch",
  "Wrist roll",
  "Gripper / trigger"
 ],
 "homeDeg": [
  0,
  -25,
  35,
  0,
  0,
  20
 ],
 "limitsDeg": [
  [
   -85,
   85
  ],
  [
   -80,
   80
  ],
  [
   -80,
   80
  ],
  [
   -80,
   80
  ],
  [
   -85,
   85
  ],
  [
   0,
   70
  ]
 ],
 "joints": [
  "follower_shoulder_link",
  "follower_upper_arm_link",
  "follower_lower_arm_link",
  "follower_wrist_link",
  "follower_gripper_link",
  "follower_moving_jaw_so101_v1_link"
 ],
 "tcp": "follower_gripper_frame_link",
 "chain": [
  {
   "id": "follower_base_link",
   "parent": null,
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": null
  },
  {
   "id": "follower_shoulder_link_datum",
   "parent": "follower_base_link",
   "position": [
    38.835300000000004,
    -8.97657e-06,
    62.4
   ],
   "rotation": [
    -180,
    0,
    180
   ],
   "joint": null
  },
  {
   "id": "follower_shoulder_link",
   "parent": "follower_shoulder_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 0
  },
  {
   "id": "follower_upper_arm_link_datum",
   "parent": "follower_shoulder_link",
   "position": [
    -30.3992,
    -18.2778,
    -54.199999999999996
   ],
   "rotation": [
    -90,
    0,
    -90
   ],
   "joint": null
  },
  {
   "id": "follower_upper_arm_link",
   "parent": "follower_upper_arm_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 1
  },
  {
   "id": "follower_lower_arm_link_datum",
   "parent": "follower_upper_arm_link",
   "position": [
    -112.57000000000001,
    -28,
    1.73763e-13
   ],
   "rotation": [
    0,
    0,
    90
   ],
   "joint": null
  },
  {
   "id": "follower_lower_arm_link",
   "parent": "follower_lower_arm_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 2
  },
  {
   "id": "follower_wrist_link_datum",
   "parent": "follower_lower_arm_link",
   "position": [
    -134.9,
    5.2,
    3.62355e-14
   ],
   "rotation": [
    0,
    0,
    -90
   ],
   "joint": null
  },
  {
   "id": "follower_wrist_link",
   "parent": "follower_wrist_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 3
  },
  {
   "id": "follower_gripper_link_datum",
   "parent": "follower_wrist_link",
   "position": [
    5.5511199999999994e-14,
    -69.1,
    18.1
   ],
   "rotation": [
    -90,
    0,
    177.2108701017695
   ],
   "joint": null
  },
  {
   "id": "follower_gripper_link",
   "parent": "follower_gripper_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 4
  },
  {
   "id": "follower_moving_jaw_so101_v1_link_datum",
   "parent": "follower_gripper_link",
   "position": [
    20.2,
    18.8,
    -23.400000000000002
   ],
   "rotation": [
    90,
    0,
    0
   ],
   "joint": null
  },
  {
   "id": "follower_gripper_frame_link_datum",
   "parent": "follower_gripper_link",
   "position": [
    -7.9,
    -0.21812099999999998,
    -98.12740000000001
   ],
   "rotation": [
    -180,
    0,
    180
   ],
   "joint": null
  },
  {
   "id": "follower_moving_jaw_so101_v1_link",
   "parent": "follower_moving_jaw_so101_v1_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": 5
  },
  {
   "id": "follower_gripper_frame_link",
   "parent": "follower_gripper_frame_link_datum",
   "position": [
    0,
    0,
    0
   ],
   "rotation": [
    0,
    0,
    0
   ],
   "joint": null
  }
 ]
} as const;
