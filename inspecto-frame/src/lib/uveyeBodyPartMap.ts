/**
 * UVeye Atlas `bodyPart` / display strings → `CAR_PARTS.name` in AssistedInspectionV3.
 * Keys are normalized: no spaces, lowercase. Short keys work with or without `BodyPart` prefix
 * (see `mapUveyePartToUiPartName` in uveyeApi).
 */

/** Short-form codes (also matched as `bodypart` + key). */
export const UVeye_BODY_PART_CODE_TO_UI: Record<string, string> = {
  // Fuel / emblem / generic
  fuelcap: 'Left Quarter Panel',
  generalbody: 'Trunk/Liftgate',
  lights: 'Headlights',
  symbolrear: 'Trunk/Liftgate',

  // Bumpers / hood / grille / plates
  bumperfront: 'Front Bumper',
  bumperrear: 'Rear Bumper',
  hood: 'Hood',
  grille: 'Grille',
  hoodplastictip: 'Hood',
  licenseplatefront: 'Front Bumper',
  licenseplaterear: 'Rear Bumper',

  // Lights — headlights vs taillights (not bumpers)
  headlightleft: 'Headlights',
  headlightright: 'Headlights',
  foglightleft: 'Headlights',
  foglightright: 'Headlights',
  clearancelightfront: 'Headlights',
  clearancelightrear: 'Taillights',
  taillightleft: 'Taillights',
  taillightright: 'Taillights',
  reflectorlightleft: 'Taillights',
  reflectorlightright: 'Taillights',
  turnsignal: 'Headlights',
  turnsignalleft: 'Headlights',
  turnsignalright: 'Headlights',

  // Glass / roof
  windshield: 'Windshield',
  roof: 'Roof',
  sunroof: 'Roof',
  roofrack: 'Roof',
  roofrackleft: 'Roof',
  roofrackright: 'Roof',
  antenna: 'Roof',

  // Mirrors
  mirror: 'Left Mirror',
  mirrorcover: 'Left Mirror',
  mirrorleft: 'Left Mirror',
  mirrorright: 'Right Mirror',
  mirrorcoverleft: 'Left Mirror',
  mirrorcoverright: 'Right Mirror',

  // Doors / handles
  doorfront: 'Left Front Door',
  doorfrontleft: 'Left Front Door',
  doorfrontright: 'Right Front Door',
  doorrear: 'Left Rear Door',
  doorrearleft: 'Left Rear Door',
  doorrearright: 'Right Rear Door',
  doorhandle: 'Left Front Door',
  doorhandlebackleft: 'Left Rear Door',
  doorhandlebackright: 'Right Rear Door',
  doorhandlefrontleft: 'Left Front Door',
  doorhandlefrontright: 'Right Front Door',
  doorlowerskinleft: 'Left Rocker',
  doorlowerskinrear: 'Rear Bumper',
  doorlowerskinright: 'Right Rocker',
  doorrailleft: 'Left Front Door',
  doorrailright: 'Right Front Door',
  backdoor: 'Tailgate',

  // Fenders / quarter
  fender: 'Left Fender',
  fenderfront: 'Left Fender',
  fenderfrontleft: 'Left Fender',
  fenderfrontright: 'Right Fender',
  fenderleft: 'Left Fender',
  fenderrear: 'Left Quarter Panel',
  fenderrearleft: 'Left Quarter Panel',
  fenderrearright: 'Right Quarter Panel',
  fenderright: 'Right Fender',

  // Wheels (Atlas body — rolling surface / rim area)
  frontwheelleft: 'Left Front Tire',
  frontwheelright: 'Right Front Tire',
  rearwheelleft: 'Left Rear Tire',
  rearwheelright: 'Right Rear Tire',
  wheel: 'Left Front Tire',

  // Trunk / rear
  trunk: 'Trunk/Liftgate',
  camerarear: 'Rear Bumper',
  tailpipe: 'Rear Bumper',

  // Windows
  sidewindow: 'Left Window',
  windowback: 'Rear Window',
  windowframe: 'Windshield',
  windowframeleft: 'Left Window',
  windowframeright: 'Right Window',
  windowfrontleft: 'Left Window',
  windowfrontright: 'Right Window',
  windowrearleft: 'Left Window',
  windowrearright: 'Right Window',

  // Wipers
  wiperfront: 'Windshield',
  wiperfrontleft: 'Windshield',
  wiperfrontright: 'Windshield',
  wiperrear: 'Rear Window',
  wiperrearleft: 'Rear Window',
  wiperrearright: 'Rear Window',
  wipers: 'Windshield',

  // Cargo / truck
  cargodooraxisbottomleft: 'Bed/Cargo',
  cargodooraxisbottomright: 'Bed/Cargo',
  cargodooraxistopleft: 'Bed/Cargo',
  cargodooraxistopright: 'Bed/Cargo',
  cargodoorhandleleft: 'Bed/Cargo',
  cargodoorhandlerear: 'Bed/Cargo',
  cargodoorhandleright: 'Bed/Cargo',
  cargodoorleft: 'Bed/Cargo',
  cargodoorrear: 'Bed/Cargo',
  cargodoorright: 'Bed/Cargo',
  cargostepleft: 'Left Bed Side',
  cargosteprear: 'Bed/Cargo',
  cargostepright: 'Right Bed Side',

  symbolfront: 'Hood',
};

/** Extra display-name keys (lowercase). Merged with UVeye_DISPLAY_TO_UI in uveyeApi. */
export const UVeye_BODY_PART_DISPLAY_TO_UI: Record<string, string> = {
  'fuel cap': 'Left Quarter Panel',
  'fuel door': 'Left Quarter Panel',
  'general body': 'Trunk/Liftgate',
  'symbol rear': 'Trunk/Liftgate',
  lights: 'Headlights',
  'tail light left': 'Taillights',
  'tail light right': 'Taillights',
  'rear light': 'Taillights',
  'fog light left': 'Headlights',
  'fog light right': 'Headlights',
};
