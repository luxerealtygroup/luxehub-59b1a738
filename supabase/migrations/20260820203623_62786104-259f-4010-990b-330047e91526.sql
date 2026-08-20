DO $$
DECLARE m uuid := '7fb01c19-0c1b-4dfc-8c4f-c2d84fd0d37c';
BEGIN
UPDATE public.launchpad_slides SET slide_number = 90 WHERE module_id = m AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 91 WHERE module_id = m AND slide_type = 'knowledge_check';

UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = 'By the end of this module, the agent can: navigate all four tabs of the Business Planning Hub and know what each one is actually for; explain the core math LUXEhub uses to turn a goal into a weekly activity number; use the Goals page, Weekly Coaching, and Reports hub together as one connected system, not separate tools; recognize when the app''s own data-quality flags mean a number should be reviewed with a mentor, not trusted blindly.' WHERE module_id = m AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'The Business Planning Hub: Performance Reality', body = 'Everything here sits behind two selectors: a time-period selector (YTD, Q1–Q4, or Custom) and a separate goal-period selector (Q1–Q4 Goals) — view your actual plan through whatever lens matters this week without leaving the page.

Tab 1, Performance Reality, is your mid-period accountability check. It shows your annual GCI goal next to where you should be by now and what you''re actually on track to earn, on a simple progress bar — then plainly states the dollar gap and which future quarter has to absorb it.

An activity pace section compares actual weekly pace against required pace across conversations, pipeline adds, appointments, listings taken, and offers written — and calls out your single biggest activity bottleneck in plain language.

The real value is math transparency: annual goal minus what you''ve already earned equals what''s left, split across remaining quarters, then the pipeline requirement (target divided by average deal size equals sales needed, sales needed divided by close rate equals people needed), down to a single weekly action like "add 2 new people to your pipeline."

It also breaks GCI down by quarter (closed/pending/conditional), shows what percentage of your annual goal is already in your pipeline, and gives a conversion-rate panel: CMA→Listing, Appt→Contract, Contact→Appt, Dials→Appt.' WHERE module_id = m AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'Reflection & Mindset, and Quarter Strategy & Goals', body = 'Tab 2, Reflection & Mindset, is the qualitative side of planning. Free-text fields for your wins year-to-date, your biggest bottleneck, and what you''re avoiding, plus sliders for confidence and stress. An AI-generated performance reflection button reads your actual activity data and journal entries and produces a written narrative covering strengths, growth opportunities, and specific strategic suggestions — a coaching memo built from your real numbers, not generic advice.

Tab 3, Quarter Strategy & Goals, is the tactical breakdown for the current quarter. It auto-calculates adjusted pending needed, pipeline gap, prior-quarter sales gap, base goal before carryover, average GCI per sale (net-to-agent and gross), and total pipeline required — then converts all of that into a required activity breakdown table: monthly, weekly, and daily targets for pending deals, pipeline additions, listings, CMAs, appointments, contacts, and dials.

There''s also an AI-suggested targets generator producing three scenarios — Conservative, Realistic, Aggressive — each with sales-to-close and weekly activity numbers, plus tactical insights flagging specific conversion bottlenecks and recommending fixes.' WHERE module_id = m AND slide_number = 3;

INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
(m, 4, 'content', 'Action Plan Tab & The Goals Page', 'Tab 4, Action Plan, distills everything into a non-negotiable weekly floor (team-committed minimums for conversations, pipeline adds, and appointments) versus a stretch target for agents who want to close their gap faster. It compares your current pace to required pace on dials, contacts, and appointments, and gives a plain-English weekly directive.

Separately, the Goals page is a dedicated view showing overall progress toward sales-closed and GCI targets as percentages, with pending deals factored in separately from closed. The Goal Breakdown section toggles between Monthly and Quarterly views — click into any month or quarter to edit sales/GCI targets directly, redistribute unevenly across the year (there''s a Reset to Even option), and attach both business goals and personal goals to specific months. A January push for listing appointments can sit right next to a personal goal like a fitness or financial target.'),
(m, 5, 'content', 'Weekly Coaching: The Accountability Engine', 'This is what feeds every number above. It tracks, week-by-week or monthly: contacts made, dials, doors knocked, appointments set/held, pipeline additions, contracts signed, firm sales, and database size — and compares actual activity to goal for calls, appointments, listings, and contracts.

A running log holds business priorities and personal priorities as checkable items, and an accountability notes section captures wins, challenges, next steps, and additional notes each week. Everything autosaves.'),
(m, 6, 'content', 'Reports Hub: Six Views for Different Questions', 'Pipeline & Sales — deals/GCI progress plus pipeline-vs-required-by-quarter, with fallout rate built in.

Budget & Finances — average sale price, commission rate, agent split, fallout rate, and a month-by-month commission forecast chart against your goal line.

Performance — a snapshot of the current week''s 4-1-1 activity goals and priorities.

Analytics — pipeline broken down by lead source, with client count and projected GCI per source, so you can see ROI by source (open house, sign call, referral, etc.) instead of guessing which activities actually pay off.

The 4-1-1 tab embeds the Weekly Coaching view.

Conversions — your specific conversion rates (contact to appointment, dials to pipeline, appointment held to contract), with automatic flags when a rate looks statistically off — for example, a rate exceeding 100 percent.'),
(m, 7, 'content', 'Activities & Why This Approach Works', 'Activities syncs directly with Follow Up Boss to automatically pull in logged calls and notes, plus a manual "My Logged Activities" option for anything outside that integration. This is the raw data source powering every activity-pace calculation elsewhere in the app — which is exactly why Module 3''s logging discipline (log every real contact attempt, even a no-answer) isn''t just CRM hygiene. It''s literally what your entire business plan is built on. Sloppy logging here means every number upstream is wrong.

Nothing in this system is a vanity metric sitting in isolation — every number rolls up into the same underlying math. Change your close rate or average deal size, and it ripples automatically through your quarterly targets, daily activity requirements, and weekly action plan.'),
(m, 8, 'content', 'Trust the Data, But Verify & Common Mistakes', 'The Conversions report flags statistically impossible numbers automatically — for instance, an Appt→Contract conversion rate showing over 100%. That''s not a sign the app is broken; it''s the app catching what''s almost certainly bad input (a logging error, a duplicate entry) before it distorts every activity target built on top of it. When you see a flag like this, review it with your mentor before trusting anything the tool calculated from it.

Common mistakes: setting a goal on the Goals page and never opening the Business Planning Hub again until year-end; logging activity inconsistently, which corrupts every pace calculation; ignoring a data-quality flag in the Conversions report instead of investigating it; treating the "stretch target" in the Action Plan tab as the real floor, burning out chasing a number that was never the actual commitment; skipping the Reflection & Mindset tab because it feels less "real" than the numbers — burnout and avoidance patterns predict missed goals just as much as bad math does.'),
(m, 9, 'content', 'What Happens at Day 90', 'The 90-day period is a hard boundary for completing all 11 modules and working closely with your mentor — not an open-ended timeline. At Day 90, your team leader and mentor assess your progress together to determine whether you''re ready to move forward independently, or whether more training/support is needed in specific areas. This is genuinely unlikely if you''ve actually used the tools and worked through every module as intended.

After Day 90, you can choose to continue working closely with your mentor, or move forward on your own — either is a normal outcome. This module, and the Business Planning Hub specifically, is exactly what that Day 90 conversation should be grounded in — walk in with real activity data and a real plan already in motion, not something built the week before.');

UPDATE public.launchpad_slides SET slide_number = 10, title = 'Practice Assignment', body = '1) Set your first annual goal on the Goals page with your mentor, and distribute it across the months — even unevenly, if your business has real seasonality.

2) Walk through all four Business Planning Hub tabs on your own numbers with your mentor, tab by tab.

3) Log a full week of activity and review your Weekly Coaching numbers together.

4) Find one conversion rate in the Reports hub and discuss with your mentor whether it looks realistic or needs investigation.' WHERE module_id = m AND slide_number = 90;

UPDATE public.launchpad_slides SET slide_number = 11, title = 'Knowledge Check', body = '1) What''s the core math chain the Performance Reality tab uses to go from an annual goal to a weekly action?

2) Where does the raw activity data powering every planning calculation actually come from? (Activities, synced from Follow Up Boss)

3) The Conversions report shows an Appt→Contract rate over 100% — what should the agent do? (Treat it as a likely data-quality issue and review with a mentor)

4) What''s the difference between the "non-negotiable weekly floor" and the "stretch target" in the Action Plan tab?

5) Why does Module 3''s note-logging discipline matter directly to this module?

6) What happens at Day 90, and what determines whether an agent needs more training? (Team leader and mentor assess together; unlikely if tools were actually used)' WHERE module_id = m AND slide_number = 91;
END $$;