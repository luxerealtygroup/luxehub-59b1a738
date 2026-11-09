import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyPipeline from "./tools/get-my-pipeline";
import getMyDeals from "./tools/get-my-deals";
import getMyWeekly411 from "./tools/get-my-weekly-411";
import addPipelineClient from "./tools/add-pipeline-client";
import recordWeekly411Actuals from "./tools/record-weekly-411-actuals";
import getTeamRoster from "./tools/get-team-roster";
import getTeamGoals from "./tools/get-team-goals";
import getTeamPipeline from "./tools/get-team-pipeline";
import getTeamDeals from "./tools/get-team-deals";
import getTeamWeekly411 from "./tools/get-team-weekly-411";
import getTeamCoachingSessions from "./tools/get-team-coaching-sessions";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "luxehub",
  title: "LUXEhub",
  version: "1.0.0",
  instructions:
    "Tools for LUXEhub, a real estate agent hub. Read the signed-in agent's pipeline clients, deals and weekly 4-1-1 accountability entries, and add new pipeline clients. Owners and admins can also record weekly 4-1-1 actuals for agents in their own brokerage. All data is scoped to the signed-in user's brokerage. Owners and admins can also read team-wide roster, goals, pipeline, deals, weekly 4-1-1 accountability and coaching sessions for every agent in their brokerage (read-only).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyPipeline, getMyDeals, getMyWeekly411, addPipelineClient, recordWeekly411Actuals, getTeamRoster, getTeamGoals, getTeamPipeline, getTeamDeals, getTeamWeekly411, getTeamCoachingSessions],
});
