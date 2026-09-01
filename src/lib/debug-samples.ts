import type { Opportunity } from "./types";

/**
 * Ready-made sample posts for exercising the wall's arrival choreography.
 *
 * These are injected straight into the client-side queue: they never reach the
 * database, never pass through moderation, and disappear on reload. That makes
 * them safe to fire repeatedly while tuning the animation, and it means the
 * "remove" shortcut can simply drop them by id prefix.
 */

const DEBUG_PREFIX = "debug-";

export function isDebugId(id: string): boolean {
  return id.startsWith(DEBUG_PREFIX);
}

type Sample = Omit<Opportunity, "id" | "created_at" | "approved_at">;

const SAMPLES: Sample[] = [
  {
    title: "Spin Qubit Characterisation Scientist",
    organisation: "Semiqon",
    type: "job_opening",
    detail:
      "CMOS-compatible spin qubits at 1 kelvin. We need someone who enjoys a dilution fridge and a probe station in equal measure. Permanent, Espoo, and yes there is a sauna.",
    tags: ["Quantum", "Semiconductors"],
    location: "Espoo, Finland",
    work_mode: "on_site",
    contact_email: "talent@example-semiqon.fi",
    contact_url: null,
    contact_note: "Booth E09",
    jd_url: null,
  },
  {
    title: "Co-Founder Wanted: Fusion Diagnostics",
    organisation: "Stellar Instruments",
    type: "co_founder",
    detail:
      "Plasma physicist with a working interferometer prototype looking for a commercial co-founder. Two tokamak operators have said they would buy it. I have never written a term sheet.",
    tags: ["Photonics", "Energy"],
    location: "Munich, Germany",
    work_mode: "hybrid",
    contact_email: "founder@example-stellar.de",
    contact_url: null,
    contact_note: null,
    jd_url: null,
  },
  {
    title: "Pilot Partner: Subsea Cable Inspection",
    organisation: "Nordic Marine Robotics",
    type: "pilot_partnership",
    detail:
      "Our AUV inspects cable routes without a support vessel. Looking for one operator to run a paid pilot in Norwegian waters next spring. We bring the vehicle and the permits.",
    tags: ["Robotics", "Space"],
    location: "Bergen, Norway",
    work_mode: "on_site",
    contact_email: "pilots@example-nmr.no",
    contact_url: "https://example-nmr.no",
    contact_note: null,
    jd_url: null,
  },
  {
    title: "Cryo-EM Specialist, Free From January",
    organisation: "Independent, ex-Novo Nordisk",
    type: "talent_available",
    detail:
      "Nine years of structural biology, most recently membrane protein pipelines at scale. Looking for a small team where the microscope is not booked out three months ahead.",
    tags: ["Biotech"],
    location: "Copenhagen, Denmark",
    work_mode: "hybrid",
    contact_email: null,
    contact_url: "https://www.linkedin.com/in/example-cryoem",
    contact_note: null,
    jd_url: null,
  },
  {
    title: "Consortium Forming: Perovskite Stability",
    organisation: "Uppsala University",
    type: "research_collaboration",
    detail:
      "Building a Horizon partnership on encapsulation for perovskite tandems. We have the accelerated ageing rig and two industrial letters of support. We need a barrier film maker.",
    tags: ["Materials", "Energy"],
    location: "Uppsala, Sweden",
    work_mode: "remote",
    contact_email: "consortium@example-uu.se",
    contact_url: null,
    contact_note: "Find me at the poster wall",
    jd_url: null,
  },
  {
    title: "Head of Manufacturing, Optical Benches",
    organisation: "Aurora Photonics",
    type: "job_opening",
    detail:
      "Taking a hand-built optical assembly to fifty units a month. You have done this before, ideally for space or defence customers, and you know which tolerances actually matter.",
    tags: ["Photonics", "Space"],
    location: "Gothenburg, Sweden",
    work_mode: "on_site",
    contact_email: "jobs@example-aurora.se",
    contact_url: null,
    contact_note: null,
    jd_url: "https://example-aurora.se/careers/manufacturing",
  },
  {
    title: "Seeking CTO for Grid-Edge Sensing",
    organisation: "Voltaflow",
    type: "co_founder",
    detail:
      "Ex-TSO operations lead with three utility LOIs and no hardware team. Looking for a co-founder who has shipped ruggedised electronics and is comfortable with substation compliance.",
    tags: ["Energy", "AI Infrastructure"],
    location: "Helsinki, Finland",
    work_mode: "hybrid",
    contact_email: "hello@example-voltaflow.fi",
    contact_url: null,
    contact_note: "Booth B22",
    jd_url: null,
  },
  {
    title: "Test Site Offered: Arctic Autonomy",
    organisation: "Sodankyla Proving Ground",
    type: "pilot_partnership",
    detail:
      "We have instrumented winter test tracks above the Arctic Circle and spare capacity from November. Suited to autonomy, battery or sensor teams who need genuine cold and real snow.",
    tags: ["Robotics", "Dual-Use"],
    location: "Sodankyla, Finland",
    work_mode: "on_site",
    contact_email: "bookings@example-proving.fi",
    contact_url: "https://example-proving.fi",
    contact_note: null,
    jd_url: null,
  },
];

/**
 * Builds the next sample post. The counter only ever climbs, so a post removed
 * and re-added never reuses an id — the masonry keeps a column assignment per
 * id, and a recycled id would inherit a stale one.
 */
export function makeDebugPost(sequence: number): Opportunity {
  const sample = SAMPLES[sequence % SAMPLES.length]!;
  const now = new Date().toISOString();
  return {
    ...sample,
    id: `${DEBUG_PREFIX}${sequence}`,
    created_at: now,
    approved_at: now,
  };
}

export const DEBUG_SAMPLE_COUNT = SAMPLES.length;
