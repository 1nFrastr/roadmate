import { JourneyTransitionProvider } from "@/components/journey/JourneyTransitionProvider";
import { JourneyShell } from "@/components/journey/JourneyShell";

export default function JourneyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <JourneyTransitionProvider>
      <JourneyShell>{children}</JourneyShell>
    </JourneyTransitionProvider>
  );
}
