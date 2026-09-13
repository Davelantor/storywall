import type { OpportunityInput } from "./types";

/**
 * Seed opportunities for day one of the summit, so the wall is never empty.
 * minutesAgo is used to spread created_at across the last ~two days.
 *
 * repository.ts writes these straight into data/live/ the first time it runs
 * against a fresh (nonexistent) DATA_DIR.
 */
export type SeedOpportunity = OpportunityInput & { minutesAgo: number };

export const SEED_OPPORTUNITIES: SeedOpportunity[] = [
  {
    title: "Senior Cryogenic Control Engineer",
    organisation: "Bluefors",
    type: "job_opening",
    detail:
      "We are scaling dilution refrigerator control electronics for 1000+ qubit systems. Looking for an engineer comfortable between FPGA firmware and millikelvin thermometry. Permanent role, relocation support to Helsinki included.",
    tags: ["Quantum", "Materials"],
    location: "Helsinki, Finland",
    work_mode: "on_site",
    contact_email: "talent@example-bluefors.fi",
    contact_url: null,
    contact_note: "Booth C14",
    jd_url: "https://example.com/jobs/cryogenic-control-engineer",
    minutesAgo: 34,
  },
  {
    title: "Photonic Integrated Circuit Designer",
    organisation: "Aalto Photonics Spinout",
    type: "job_opening",
    detail:
      "Early team hire for a silicon nitride PIC startup out of Micronova. You would own layout and tape-out for our second-generation optical switch. Experience with Luceda or Cadence and a tolerance for pre-Series-A chaos required.",
    tags: ["Photonics", "Semiconductors"],
    location: "Espoo, Finland",
    work_mode: "hybrid",
    contact_email: "founders@example-photonics.fi",
    contact_url: "https://www.linkedin.com/company/example-photonics",
    contact_note: null,
    jd_url: null,
    minutesAgo: 96,
  },
  {
    title: "Head of Wafer Process Integration",
    organisation: "Norrsken Semiconductors",
    type: "job_opening",
    detail:
      "Building a 200mm compound semiconductor pilot line in Norrbotten. We need someone who has taken a process from R&D into qualified production. Strong equity component, and yes, the winters are real.",
    tags: ["Semiconductors", "Materials"],
    location: "Lulea, Sweden",
    work_mode: "on_site",
    contact_email: null,
    contact_url: "https://www.linkedin.com/in/example-recruiter",
    contact_note: "Find me at the Sweden pavilion",
    jd_url: "https://example.com/careers/process-integration",
    minutesAgo: 187,
  },
  {
    title: "Technical Co-Founder, Engineered Biology",
    organisation: "Solved by Enzymes",
    type: "co_founder",
    detail:
      "Commercial founder with 11 years in industrial fermentation looking for a CTO. Thesis: enzymatic depolymerisation of mixed textile waste. I have two LOIs from Nordic textile recyclers and a term sheet conversation started.",
    tags: ["Biotech", "Materials"],
    location: "Copenhagen, Denmark",
    work_mode: "hybrid",
    contact_email: "hello@example-enzymes.dk",
    contact_url: null,
    contact_note: null,
    jd_url: null,
    minutesAgo: 268,
  },
  {
    title: "Co-Founder / Head of Flight Software",
    organisation: "Kvasar Space",
    type: "co_founder",
    detail:
      "Two hardware founders seeking a third for on-orbit edge compute. We have the payload and a launch slot in Q3 2027; we do not have the person who owns the software stack. Equal equity, no salary until seed closes.",
    tags: ["Space", "AI Infrastructure"],
    location: "Espoo, Finland",
    work_mode: "on_site",
    contact_email: "founders@example-kvasar.space",
    contact_url: "https://example-kvasar.space",
    contact_note: "Booth A02",
    jd_url: null,
    minutesAgo: 410,
  },
  {
    title: "Pilot Site Wanted: Autonomous Yard Logistics",
    organisation: "Trailerbot Robotics",
    type: "pilot_partnership",
    detail:
      "We move unpowered trailers around distribution yards autonomously. Looking for one Nordic logistics operator to run a paid 12-week pilot in Q1 2027. We bring the vehicle, insurance and safety case; you bring the yard.",
    tags: ["Robotics"],
    location: "Gothenburg, Sweden",
    work_mode: "on_site",
    contact_email: "pilots@example-trailerbot.se",
    contact_url: "https://example-trailerbot.se",
    contact_note: null,
    jd_url: null,
    minutesAgo: 520,
  },
  {
    title: "Industrial Partner for Bio-Based Composites",
    organisation: "VTT Technical Research Centre",
    type: "pilot_partnership",
    detail:
      "Our lignin-reinforced composite is at TRL 5 and needs a manufacturing partner to reach TRL 7. Ideal fit: an automotive or marine interior supplier already running injection moulding. Co-funding routes through Business Finland available.",
    tags: ["Materials", "Biotech"],
    location: "Espoo, Finland",
    work_mode: "hybrid",
    contact_email: "partnerships@example-vtt.fi",
    contact_url: null,
    contact_note: "Booth D31",
    jd_url: null,
    minutesAgo: 735,
  },
  {
    title: "Joint Call: Mid-Infrared Sensing for Emissions",
    organisation: "SINTEF",
    type: "research_collaboration",
    detail:
      "Assembling a Horizon Europe consortium on quantum cascade laser sensing for methane at industrial sites. We have two research partners and need one instrument manufacturer plus one end user. Expressions of interest close 30 October.",
    tags: ["Photonics", "Energy"],
    location: "Trondheim, Norway",
    work_mode: "remote",
    contact_email: "consortium@example-sintef.no",
    contact_url: "https://example-sintef.no/calls/mir-sensing",
    contact_note: null,
    jd_url: null,
    minutesAgo: 1420,
  },
  {
    title: "Dual-Use Research Partner: Resilient Navigation",
    organisation: "Nordic Defence Innovation Cluster",
    type: "research_collaboration",
    detail:
      "Looking for a university group working on GNSS-denied navigation to join a dual-use programme with defence and civil aviation end users. Funding is secured for two years; we need the inertial and vision expertise.",
    tags: ["Dual-Use", "Space", "Robotics"],
    location: "Stockholm, Sweden",
    work_mode: "hybrid",
    contact_email: "programme@example-ndic.org",
    contact_url: null,
    contact_note: "Booth B07",
    jd_url: null,
    minutesAgo: 1755,
  },
  {
    title: "Grid-Scale Storage Pilot: Two Sites Open",
    organisation: "Fortum Ventures",
    type: "pilot_partnership",
    detail:
      "We have two Finnish grid connection points available for novel long-duration storage chemistries in 2027. Pre-revenue startups welcome; we handle permitting and offtake modelling. Sodium-ion, iron-air and thermal all in scope.",
    tags: ["Energy", "Materials"],
    location: "Tampere, Finland",
    work_mode: "on_site",
    contact_email: "ventures@example-fortum.fi",
    contact_url: "https://example-fortum.fi/ventures",
    contact_note: null,
    jd_url: "https://example-fortum.fi/ventures/storage-pilot-2027",
    minutesAgo: 2090,
  },
];
