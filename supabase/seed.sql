-- ===========================================================================
-- NORDEEP Opportunity Wall - seed data (12 approved sample opportunities)
-- ---------------------------------------------------------------------------
-- GENERATED FILE - do not edit by hand.
-- Source: src/lib/seed-data.ts   Regenerate: node scripts/generate-seed-sql.mjs
--
-- Run after supabase/schema.sql. Safe to re-run: it clears previous seed rows
-- (matched by title) before inserting, and never touches real submissions.
-- ===========================================================================

begin;

delete from public.opportunities
where title in (
  'Senior Cryogenic Control Engineer',
  'Photonic Integrated Circuit Designer',
  'Head of Wafer Process Integration',
  'Technical Co-Founder, Engineered Biology',
  'Co-Founder / Head of Flight Software',
  'Pilot Site Wanted: Autonomous Yard Logistics',
  'Industrial Partner for Bio-Based Composites',
  'ML Systems Engineer, Available From November',
  'Quantum Algorithms PhD Graduating in December',
  'Joint Call: Mid-Infrared Sensing for Emissions',
  'Dual-Use Research Partner: Resilient Navigation',
  'Grid-Scale Storage Pilot: Two Sites Open'
);

insert into public.opportunities
  (title, organisation, type, detail,
   tags, location, work_mode,
   contact_email, contact_url, contact_note, jd_url,
   status, created_at)
values
  ('Senior Cryogenic Control Engineer', 'Bluefors', 'job_opening'::public.opportunity_type, 'We are scaling dilution refrigerator control electronics for 1000+ qubit systems. Looking for an engineer comfortable between FPGA firmware and millikelvin thermometry. Permanent role, relocation support to Helsinki included.',
   array['Quantum', 'Materials']::text[], 'Helsinki, Finland', 'on_site'::public.work_mode,
   'talent@example-bluefors.fi', null, 'Booth C14', 'https://example.com/jobs/cryogenic-control-engineer',
   'approved'::public.opportunity_status, now() - interval '34 minutes'),

  ('Photonic Integrated Circuit Designer', 'Aalto Photonics Spinout', 'job_opening'::public.opportunity_type, 'Early team hire for a silicon nitride PIC startup out of Micronova. You would own layout and tape-out for our second-generation optical switch. Experience with Luceda or Cadence and a tolerance for pre-Series-A chaos required.',
   array['Photonics', 'Semiconductors']::text[], 'Espoo, Finland', 'hybrid'::public.work_mode,
   'founders@example-photonics.fi', 'https://www.linkedin.com/company/example-photonics', null, null,
   'approved'::public.opportunity_status, now() - interval '96 minutes'),

  ('Head of Wafer Process Integration', 'Norrsken Semiconductors', 'job_opening'::public.opportunity_type, 'Building a 200mm compound semiconductor pilot line in Norrbotten. We need someone who has taken a process from R&D into qualified production. Strong equity component, and yes, the winters are real.',
   array['Semiconductors', 'Materials']::text[], 'Lulea, Sweden', 'on_site'::public.work_mode,
   null, 'https://www.linkedin.com/in/example-recruiter', 'Find me at the Sweden pavilion', 'https://example.com/careers/process-integration',
   'approved'::public.opportunity_status, now() - interval '187 minutes'),

  ('Technical Co-Founder, Engineered Biology', 'Solved by Enzymes', 'co_founder'::public.opportunity_type, 'Commercial founder with 11 years in industrial fermentation looking for a CTO. Thesis: enzymatic depolymerisation of mixed textile waste. I have two LOIs from Nordic textile recyclers and a term sheet conversation started.',
   array['Biotech', 'Materials']::text[], 'Copenhagen, Denmark', 'hybrid'::public.work_mode,
   'hello@example-enzymes.dk', null, null, null,
   'approved'::public.opportunity_status, now() - interval '268 minutes'),

  ('Co-Founder / Head of Flight Software', 'Kvasar Space', 'co_founder'::public.opportunity_type, 'Two hardware founders seeking a third for on-orbit edge compute. We have the payload and a launch slot in Q3 2027; we do not have the person who owns the software stack. Equal equity, no salary until seed closes.',
   array['Space', 'AI Infrastructure']::text[], 'Espoo, Finland', 'on_site'::public.work_mode,
   'founders@example-kvasar.space', 'https://example-kvasar.space', 'Booth A02', null,
   'approved'::public.opportunity_status, now() - interval '410 minutes'),

  ('Pilot Site Wanted: Autonomous Yard Logistics', 'Trailerbot Robotics', 'pilot_partnership'::public.opportunity_type, 'We move unpowered trailers around distribution yards autonomously. Looking for one Nordic logistics operator to run a paid 12-week pilot in Q1 2027. We bring the vehicle, insurance and safety case; you bring the yard.',
   array['Robotics']::text[], 'Gothenburg, Sweden', 'on_site'::public.work_mode,
   'pilots@example-trailerbot.se', 'https://example-trailerbot.se', null, null,
   'approved'::public.opportunity_status, now() - interval '520 minutes'),

  ('Industrial Partner for Bio-Based Composites', 'VTT Technical Research Centre', 'pilot_partnership'::public.opportunity_type, 'Our lignin-reinforced composite is at TRL 5 and needs a manufacturing partner to reach TRL 7. Ideal fit: an automotive or marine interior supplier already running injection moulding. Co-funding routes through Business Finland available.',
   array['Materials', 'Biotech']::text[], 'Espoo, Finland', 'hybrid'::public.work_mode,
   'partnerships@example-vtt.fi', null, 'Booth D31', null,
   'approved'::public.opportunity_status, now() - interval '735 minutes'),

  ('ML Systems Engineer, Available From November', 'Independent, ex-Graphcore', 'talent_available'::public.opportunity_type, 'Six years on compiler and interconnect work for AI accelerators, most recently distributed training on 4k-chip clusters. Finishing a contract in October and want to stay in deep tech hardware rather than move to another web shop.',
   array['AI Infrastructure', 'Semiconductors']::text[], 'Oslo, Norway', 'remote'::public.work_mode,
   null, 'https://www.linkedin.com/in/example-ml-engineer', null, null,
   'approved'::public.opportunity_status, now() - interval '880 minutes'),

  ('Quantum Algorithms PhD Graduating in December', 'University of Copenhagen', 'talent_available'::public.opportunity_type, 'Thesis on variational algorithms for lattice QCD, two first-author papers. I would rather join an early quantum software team than take a postdoc. Open to Helsinki, Stockholm or Copenhagen, and happy to start part-time now.',
   array['Quantum']::text[], 'Copenhagen, Denmark', 'hybrid'::public.work_mode,
   'phd.candidate@example-ku.dk', null, 'Find me at the poster session', null,
   'approved'::public.opportunity_status, now() - interval '1105 minutes'),

  ('Joint Call: Mid-Infrared Sensing for Emissions', 'SINTEF', 'research_collaboration'::public.opportunity_type, 'Assembling a Horizon Europe consortium on quantum cascade laser sensing for methane at industrial sites. We have two research partners and need one instrument manufacturer plus one end user. Expressions of interest close 30 October.',
   array['Photonics', 'Energy']::text[], 'Trondheim, Norway', 'remote'::public.work_mode,
   'consortium@example-sintef.no', 'https://example-sintef.no/calls/mir-sensing', null, null,
   'approved'::public.opportunity_status, now() - interval '1420 minutes'),

  ('Dual-Use Research Partner: Resilient Navigation', 'Nordic Defence Innovation Cluster', 'research_collaboration'::public.opportunity_type, 'Looking for a university group working on GNSS-denied navigation to join a dual-use programme with defence and civil aviation end users. Funding is secured for two years; we need the inertial and vision expertise.',
   array['Dual-Use', 'Space', 'Robotics']::text[], 'Stockholm, Sweden', 'hybrid'::public.work_mode,
   'programme@example-ndic.org', null, 'Booth B07', null,
   'approved'::public.opportunity_status, now() - interval '1755 minutes'),

  ('Grid-Scale Storage Pilot: Two Sites Open', 'Fortum Ventures', 'pilot_partnership'::public.opportunity_type, 'We have two Finnish grid connection points available for novel long-duration storage chemistries in 2027. Pre-revenue startups welcome; we handle permitting and offtake modelling. Sodium-ion, iron-air and thermal all in scope.',
   array['Energy', 'Materials']::text[], 'Tampere, Finland', 'on_site'::public.work_mode,
   'ventures@example-fortum.fi', 'https://example-fortum.fi/ventures', null, 'https://example-fortum.fi/ventures/storage-pilot-2027',
   'approved'::public.opportunity_status, now() - interval '2090 minutes');

commit;

-- Sanity check:
--   select type, count(*) from public.opportunities
--   where status = 'approved' group by type order by type;
