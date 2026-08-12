
-- Park PA / KC rows
UPDATE public.launchpad_slides SET slide_number = 106 WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107 WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_type = 'knowledge_check';

UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $b1$This module is factual information, not legal advice — anything legally ambiguous, always confirm with your mentor or broker before acting.

By the end of this module, the agent can:
- List the 16 grounds protected under the Ontario Human Rights Code in a housing context.
- Explain why certain tenant-screening practices, even "neutral" ones like income ratios, can still be discriminatory.
- Explain what TRESA is, what RECO does, and the core obligation to give and explain the RECO Information Guide.
- Explain the agent's FINTRAC identity-verification obligations and why they now extend to unrepresented parties too.
- Correctly disclose any financial benefit connected to a referral, in writing, before it's received.
- Know when to stop and escalate to a mentor or broker instead of guessing.$b1$ WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Ontario Human Rights Code — Housing', body = $b2$The Code applies to buying, selling, renting, and being evicted from a property.

Protected grounds relevant to housing: race, ancestry, place of origin, colour, ethnic origin, citizenship, creed (religion), sex, sexual orientation, gender identity, gender expression, age, marital status, family status, disability, receipt of public assistance.

Two grounds agents most often miss:
- Family status — refusing a rental because the applicant has children is discrimination, full stop.
- Receipt of public assistance — a tenant can't be screened out for being on ODSP, Ontario Works, or similar income support.

Screening tools (credit checks, income verification, references, rental history) are legal, but must be used in a bona fide, non-discriminatory way — applied the same way to every applicant.

The AI tenant screening tool (Module 1) produces a score and landlord report that is decision support only — it does not know Human Rights Code grounds and cannot make the legal call. The agent and landlord own the final decision and must be able to articulate non-discriminatory reasoning independent of the AI score.$b2$ WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'TRESA & RECO', body = $b3$RECO (Real Estate Council of Ontario) regulates all real estate agents and brokerages in the province.

TRESA (Trust in Real Estate Services Act, 2002) is the legislation RECO enforces, with major changes effective December 2023.

Every agent operates under TRESA's Code of Ethics: honesty, fairness, competence, and disclosure obligations to clients and to self-represented parties on the other side of a deal.

RECO Information Guide: before providing any services or assistance, agents must give a copy of the guide to the prospective client or self-represented party, and explain its contents.

Multiple representation and self-represented-party situations have specific disclosure requirements — if a deal has anyone not represented by another agent, confirm the disclosure steps with your mentor before proceeding.

Complaints against an agent go through RECO's Complaints, Compliance and Discipline process — documentation matters as much as doing the right thing.$b3$ WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_number = 3;

INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('9e227428-8cd8-4ded-b568-1a833d1327ad', 4, 'content', 'FINTRAC / Anti-Money Laundering', $b4$Real estate agents are a regulated sector under the Proceeds of Crime (Money Laundering) and Terrorist Financing Act, enforced by FINTRAC.

Core obligations:
- Verify the identity of every client using government-issued photo ID.
- As of October 1, 2025, this extends to unrepresented parties too, not just your own client.
- Determine whether a third party is actually behind a transaction, and record that determination.
- Keep records for 5 years.
- Report certain transactions (large cash, suspicious activity) to FINTRAC.

Responsibility for identification and record-keeping sits with the brokerage even when an individual agent performs the verification.

ID verification and record-keeping happen through LUXEhub as part of the submission process.$b4$),
('9e227428-8cd8-4ded-b568-1a833d1327ad', 5, 'content', 'Financial Benefit & Referral Disclosure', $b5$This applies any time you recommend a vendor — a mortgage broker, lawyer, contractor, stager, inspector, or anyone else.

Under the RECO Code of Ethics, an agent must disclose any direct or indirect financial benefit the agent, or a person related to the agent, might receive in connection with services provided to a client — as soon as the agent knows, or ought to know, a benefit might be received.

The disclosure must be in writing, at the earliest practicable opportunity, before any compensation or benefit is received, stating the amount or range of compensation. The agent must get the client's written acknowledgement and give them a copy.

Referral fees must be received through the employing brokerage — never accepted personally. This applies even if a related person receives the compensation.

OAKHAUS: Kristen owns both Luxe Realty Group and OAKHAUS. This confirmed ownership relationship requires written disclosure to every seller before recommending OAKHAUS, with written acknowledgement obtained, separate from any per-referral fee question.

See the separate Vendor & Preferred Partner Contact List for our current full vendor roster.$b5$);

UPDATE public.launchpad_slides SET slide_number = 6, title = 'Practice Assignment', body = $b6$1) Identify one scenario from your own book of business (or a hypothetical) where a screening decision could look discriminatory even if unintentional, and discuss with your mentor how to avoid it.

2) Practice giving and explaining the RECO Information Guide out loud to your mentor as if they were a new client.

3) Walk through the FINTRAC ID verification steps in LUXEhub on a live or practice file with your mentor.

4) Confirm directly with your mentor exactly which document in the seller paperwork carries the OAKHAUS financial-interest disclosure, and practice explaining it to a hypothetical seller in plain language.

5) Practice writing a financial-benefit disclosure for a hypothetical referral fee scenario, including the acknowledgement step.$b6$ WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 7, title = 'Knowledge Check', body = $b7$1) Name four grounds protected under the Ontario Human Rights Code in housing.

2) Why can't a landlord refuse an applicant just because they receive ODSP or Ontario Works?

3) What two things must an agent do under TRESA before providing services to a prospective client or self-represented party? (Give the RECO Information Guide, and explain its contents)

4) True or false: FINTRAC identity verification only applies to your own client, not the other side of the deal. (False, as of October 1, 2025)

5) An AI tenant screening report recommends declining an applicant — is that enough documentation to defend the decision? (No)

6) When must a financial benefit from a referral be disclosed — before or after receiving it? (Before)

7) Can an agent accept a referral fee directly from a vendor? (No — through the brokerage only)

8) Who owns OAKHAUS, and what does that mean for how it's recommended to sellers? (Kristen, who also owns Luxe — requires written disclosure before recommending it)$b7$ WHERE module_id = '9e227428-8cd8-4ded-b568-1a833d1327ad' AND slide_number = 107;
