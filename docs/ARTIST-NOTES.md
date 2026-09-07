# Wondrous miniature court

The battlefield and all twelve miniatures are original procedural 3D assets built from actual Three.js geometry. They require no external models, textures, environment maps, font servers, or model licenses. Rendering uses React Three Fiber and Drei with a responsive orthographic camera, orbit controls, sunlight, shadows and a forest-green atmosphere.

The court has alternating sandstone and moss-green squares, a raised stone foundation, pale border rails and a gold diamond frieze. Low-poly firs, scattered stones and four animated fire braziers establish the medieval woodland setting. Every character uses a team-trimmed circular miniature base, physical legs, torso, head, cape and equipment. Health bars face the camera; a small gold pip means recovery.

Silhouettes: Warden has a heavy shield and gold shoulder; Knight has a crested helmet and sword; Ranger a bow and green hood; Arcanist a tall violet hat and luminous staff; Cleric ivory robes and a gold cross; Rogue paired daggers and purple hood; Pikeman a long spear; Herald a crimson banner; Pyromancer orange robes and floating fire; Frostweaver an ice crown and cyan staff; Druid branching antlers and a green staff; Revenant dark armor and a spectral sword.

Selected units have a gold ground ring. Legal moves have mint overlays, attacks coral overlays, and skills violet overlays. All board cells and living miniatures preserve the parent callbacks. Position changes interpolate and characters gently breathe. Canvas pixel ratio is capped at 1.7 to keep the board economical on desktop GPUs.

Component verification: TypeScript reported no errors in either Battlefield.tsx or miniatures.tsx at delivery. Browser integration and overall application verification are owned by the main implementation task.

Follow-up interaction pass: miniatures smoothly rotate to server-provided cardinal facing, with a small base arrow indicating their forward direction. `homeSide` flips initial camera placement and deployment shading for the north player. Damage, healing and mana expenditure trigger local fading colored rings and rising particles, including a final effect on defeat when the unit remains in the state. Board coordinates are baked onto one locally generated transparent CanvasTexture, avoiding external fonts and adding only one draw call. Global TypeScript validation passed after this pass.
