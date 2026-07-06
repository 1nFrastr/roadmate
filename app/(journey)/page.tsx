import { InterestLab } from "@/components/interest-lab/InterestLab";
import { getLlmModel } from "@/components/interest-lab/server/env";

export default function JourneyHomePage() {
  return (
    <main className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <InterestLab llmModel={getLlmModel()} />
    </main>
  );
}
