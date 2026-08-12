
DO $mig$
DECLARE
  jr uuid := '318bb0fb-7604-4298-a9a0-d93665de6f0b';
  as_ uuid := '427b567f-4f41-498c-9ffe-18de0f12868c';
BEGIN
  -- park the assignment/check rows out of the way
  UPDATE public.launchpad_slides SET slide_number = slide_number + 100
   WHERE module_id IN (jr, as_) AND slide_type IN ('practice_assignment','knowledge_check');

  -- clear placeholder content slides for these two modules only
  DELETE FROM public.launchpad_slides
   WHERE module_id IN (jr, as_) AND slide_type = 'content';

  -- ===== JUNIOR content slides 1-9 =====
  INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type, body) VALUES
  (jr, 1, 'Learning Objectives', 'content', $b$By the end of this module, you can:

- Move a lead through Follow Up Boss and log every touchpoint correctly.
- Upload paperwork and track status in LUXEhub, and know what's needed at each stage.
- Prep, send, and track a signature package in AuthentiSign start to finish.
- Explain where AI supports lead re-engagement, tenant screening, pricing, and personal brand content — and where you still make the call.$b$),
  (jr, 2, 'Your Tech Stack, End to End', 'content', $b$Client & transaction systems

- Follow Up Boss — CRM & lead pipeline.
- Ylopo — powers our AI lead flow, integrated with FUB.
- LUXEhub — paperwork & submissions. The ONLY system agents submit through.
- AuthentiSign — e-signature & document flow.
- Asana — runs behind LUXEhub for our TCs. Agents never need a login.
- SkySlope — where our Director of Operations files documents for brokerage compliance review. Agents upload to LUXEhub and it flows there; not something agents access directly.

Team communication & content

- Slack — team communication.
- Canva — marketing design.
- Curb Hero — open house sign-in and lead capture.
- Claude Team/Cowork — AI assistant for drafting, research, and general work support.$b$),
  (jr, 3, 'Follow Up Boss Smart Lists (Priority Queues)', 'content', $b$Our smart lists are not a linear funnel — they are queue-based.

Priority queues. Work these first, every session:

- CALL NOW — the single highest-priority queue.
- HANDRAISERS — AI ENGAGED — leads the AI re-engagement tool has already warmed up.
- NEW — NOT CONTACTED — brand new, zero touches. Speed matters most.
- NEW — ATTEMPTED CONTACT — reached out once, haven't connected.
- A — Hot Prospect — most active. Weekly touch, no exceptions.$b$),
  (jr, 4, 'Smart Lists (Nurture Cadence) & the Lead Day Pond', 'content', $b$Cadence queues

- B — Warm Leads — every 21 days.
- C — Cool — every 45 days.
- Long Term Nurture — every 90 days.
- Sphere/Past Clients — quarterly.

The Lead Day Pond

Separately, the Lead Day Pond is a shared pond, not a personal list. Each agent is assigned a weekday as their "lead day" and is responsible for monitoring the pond and calling every lead in it on that day.

Missing your lead day means those leads may go unworked until the next agent's day comes around.$b$),
  (jr, 5, 'AI Lead Re-Engagement', 'content', $b$How it works

- Identifies stale leads automatically.
- Drafts a personalized re-engagement message.
- You review and send — nothing goes out without your review.

When a lead responds, it moves into HANDRAISERS — AI ENGAGED. Work that queue like a CALL NOW-level priority: same day.$b$),
  (jr, 6, 'LUXEhub: Where You Submit Paperwork', 'content', $b$Every document, disclosure, and status update goes through LUXEhub.

Deal stages

Offer Accepted → Deposit Delivered → Home Inspection → Documents to Lender → Conditions Removed → Lawyers Prepare → Closing Day

Behind the scenes, TCs manage Asana — that's their system, not yours.

Who handles what

Agent (LUXEhub)
- Schedule inspection & attend.
- Negotiate repairs.
- Coordinate closing with lawyers.
- Confirm final walkthrough & keys.

TC (Asana)
- Confirm deposit delivered & trust receipt issued.
- Track condition deadlines & confirm waivers.$b$),
  (jr, 7, 'AuthentiSign & AI Tenant Screening', 'content', $b$AuthentiSign flow

Prep document package → set signing order → send to all parties → track & send reminders → executed docs auto-file into LUXEhub.

AI Tenant Screening

Application submitted → AI screens & scores → landlord report generated → agent presents recommendation.

The score and report are decision support, not the decision. Ontario Human Rights Code compliance — 16 protected grounds, including family status and receipt of public assistance — is always the agent's and landlord's responsibility.$b$),
  (jr, 8, 'AI Market Analysis & Pricing Package', 'content', $b$Inputs

- Live market trend data.
- GeoWarehouse report.
- Active & sold comparables.

Output package

- Market trend summary in plain language.
- Listing prep recommendations.
- Pricing adjustments made, and why.
- Recommended list price in three ranges: Aggressive / Median / Optimistic.$b$),
  (jr, 9, 'AI Personal Brand: Social Media Audit & Content Plan', 'content', $b$A fourth AI tool: it audits your current social media presence and proposes a content calendar — a realistic mix of listing content, market education, community posts, and client wins.

You personalize every post and check brokerage disclosure before posting. The tool drafts; it doesn't handle compliance for you.$b$);

  -- ===== ASSOCIATE content slides 1-4 =====
  INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type, body) VALUES
  (as_, 1, 'Learning Objectives', 'content', $b$By the end of this module, you can:

- Navigate our specific tech stack — Follow Up Boss, LUXEhub, AuthentiSign.
- Explain the LUXEhub/Asana split correctly.
- Know what our four AI tools do, and where the agent still makes the call.$b$),
  (as_, 2, 'Quick-Reference: Our Tech Stack', 'content', $b$- Follow Up Boss — CRM.
- Ylopo — AI lead flow / re-engagement, integrated with FUB.
- LUXEhub — the only submission system.
- AuthentiSign — e-signature.
- Asana — backend-only for TCs. Agents never log in.
- SkySlope — backend compliance filing, not agent-accessed.
- Slack, Canva, Curb Hero, Claude Team/Cowork.$b$),
  (as_, 3, 'What''s Actually New Here (Systems)', 'content', $b$The LUXEhub/Asana split trips up experienced agents most: you submit and track everything through LUXEhub, your TC handles Asana.

Our FUB smart lists are queue-based, not a linear funnel.

Priority
- CALL NOW
- HANDRAISERS — AI ENGAGED
- NEW — NOT CONTACTED
- NEW — ATTEMPTED CONTACT
- A — Hot Prospect

Cadence
- B — Warm — 21 days
- C — Cool — 45 days
- Long Term Nurture — 90 days
- Sphere/Past Clients — quarterly$b$),
  (as_, 4, 'What''s Actually New Here (AI Tools)', 'content', $b$Four AI tools are likely new to you regardless of experience:

- Lead re-engagement — feeds HANDRAISERS — AI ENGAGED.
- Tenant screening — decision support only; you must document Human Rights Code–compliant reasoning.
- Market analysis & pricing package (a.k.a. CMA Boss) — three pricing tiers.
- Personal brand audit & content plan — the agent personalizes, and checks disclosure before posting.$b$);

  -- ===== practice assignment / knowledge check content + final ordering =====
  UPDATE public.launchpad_slides SET slide_number = 10, title = 'Practice Assignment', body = $b$Complete these with your mentor:

1. Log in to FUB, LUXEhub, and AuthentiSign together with your mentor — confirm access and permissions.
2. Pull up one active deal in LUXEhub and walk through every submission requirement and status update.
3. Review one AI-generated pricing package together and identify each of its five components.
4. Send a test document package through AuthentiSign to your own email.
5. Run your own social media audit with the AI personal brand tool and review the resulting content plan with your mentor.$b$
   WHERE module_id = jr AND slide_type = 'practice_assignment';

  UPDATE public.launchpad_slides SET slide_number = 11, title = 'Knowledge Check', body = $b$1. Name three of our FUB smart lists and the follow-up cadence for each.
2. What powers our AI lead re-engagement behavior in FUB, and what tool handles open house sign-ins? (Ylopo; Curb Hero)
3. Who confirms the deposit was delivered and trust receipt issued — you in LUXEhub, or your TC in Asana? (TC, in Asana)
4. Name the three inputs that feed the AI pricing package.
5. What are the three pricing ranges? (Aggressive, Median, Optimistic)
6. True or false: an AI tenant score alone is sufficient to deny a rental applicant. (False)$b$
   WHERE module_id = jr AND slide_type = 'knowledge_check';

  UPDATE public.launchpad_slides SET slide_number = 5, title = 'Practice Assignment', body = $b$Complete these with your mentor:

1. Confirm your logins and permissions in FUB, LUXEhub, and AuthentiSign with your mentor.
2. Pull up one active deal in LUXEhub and confirm what you're responsible for vs. what your TC handles in Asana.
3. Review one AI-generated pricing package together and confirm you can explain all three tiers.$b$
   WHERE module_id = as_ AND slide_type = 'practice_assignment';

  UPDATE public.launchpad_slides SET slide_number = 6, title = 'Knowledge Check', body = $b$1. Do agents ever need an Asana login here? (No)
2. Name our five priority FUB smart lists.
3. A tenant screening report recommends declining an applicant — is that enough on its own? (No — decision support only)$b$
   WHERE module_id = as_ AND slide_type = 'knowledge_check';
END
$mig$;
