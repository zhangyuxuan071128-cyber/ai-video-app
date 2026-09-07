export const motionConfig = {
  entrance: {
    background: 0.5,
    portal: 0.9,
    hud: 0.6,
    panel: 0.72,
    stagger: 0.16,
  },
  pointer: {
    backgroundTravel: 4,
    portalTravel: 10,
    hudTravel: 14,
    panelTravel: 2,
    panelTiltX: 0.9,
    panelTiltY: 1.4,
    settleDuration: 0.72,
  },
  wheel: {
    portalRotation: 0.5,
    impulseDuration: 0.44,
  },
  particles: {
    desktop: 104,
    compact: 40,
    reduced: 30,
    pointerRadius: 190,
    maxRepel: 7,
  },
} as const;

export const motionEase = {
  enter: "power3.out",
  settle: "power3.out",
  move: "power2.out",
} as const;
