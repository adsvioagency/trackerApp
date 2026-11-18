import { expect, it } from "vitest";
import { changeGoalStatus, getTrackedGoal, listTrackedGoals, saveTrackedGoal, writeMilestone, type GoalInput } from "@/lib/goal-tracker";
import { makeUser } from "./helpers";

const plan: GoalInput = {
  title: "Spend more time together",
  area: "Family",
  workspace: "personal",
  year: 2027,
  dueDate: null,
  motivation: "Make weekends count.",
  outcome: "Take one family day trip every quarter.",
};

it("keeps milestones in entry order and preserves their progress through edits, completion, and archiving", async () => {
  const owner = await makeUser();
  const id = await saveTrackedGoal(owner.id, plan, undefined, ["Choose places", "Pick dates"]);
  let goal = (await getTrackedGoal(owner.id, id))!;
  expect(goal.milestones.map((step) => step.title)).toEqual(["Choose places", "Pick dates"]);
  const first = goal.milestones[0].id;
  await writeMilestone(owner.id, id, { type: "toggle", id: first, done: true });
  await writeMilestone(owner.id, id, { type: "save", id: first, data: { title: "Choose four places", dueDate: "2027-03-31" } });
  await writeMilestone(owner.id, id, { type: "save", data: { title: "Book the first trip", dueDate: null } });
  await changeGoalStatus(owner.id, id, "complete");
  await changeGoalStatus(owner.id, id, "archive");
  await expect(writeMilestone(owner.id, id, { type: "toggle", id: first, done: false })).rejects.toThrow("Restore");
  await changeGoalStatus(owner.id, id, "restore");
  goal = (await getTrackedGoal(owner.id, id))!;
  expect(goal.completedAt).toBeTruthy();
  expect(goal.archivedAt).toBeNull();
  expect(goal.milestones[0]).toMatchObject({ title: "Choose four places", dueDate: "2027-03-31", completedAt: expect.any(Date) });
  expect(goal.milestones[2].title).toBe("Book the first trip");
});

it("filters the annual plan by workspace and denies cross-owner or mismatched milestone changes", async () => {
  const owner = await makeUser();
  const outsider = await makeUser();
  const personal = await saveTrackedGoal(owner.id, plan, undefined, ["First milestone"]);
  const business = await saveTrackedGoal(owner.id, { ...plan, workspace: "business", area: "Operations" });
  await saveTrackedGoal(owner.id, { ...plan, year: 2028 });
  expect((await listTrackedGoals(owner.id, "combined", { year: 2027 })).map((goal) => goal.id)).toEqual([personal, business]);
  expect((await listTrackedGoals(owner.id, "business", { year: 2027 })).map((goal) => goal.id)).toEqual([business]);
  expect((await listTrackedGoals(owner.id, "combined", { search: "more time", year: 2027 }))).toHaveLength(2);
  expect(await getTrackedGoal(outsider.id, personal)).toBeNull();
  await expect(saveTrackedGoal(outsider.id, plan, personal)).rejects.toThrow("Goal not found");
  await expect(changeGoalStatus(outsider.id, personal, "complete")).rejects.toThrow("Goal not found");
  const [step] = (await getTrackedGoal(owner.id, personal))!.milestones;
  await expect(writeMilestone(outsider.id, personal, { type: "toggle", id: step.id, done: true })).rejects.toThrow("Goal not found");
  await expect(writeMilestone(owner.id, business, { type: "remove", id: step.id })).rejects.toThrow("Milestone not found");
  expect((await getTrackedGoal(owner.id, personal))!.milestones[0].completedAt).toBeNull();
});
