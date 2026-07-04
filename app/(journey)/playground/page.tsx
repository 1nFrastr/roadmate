import { DevicePlayground } from "@/components/device-playground/DevicePlayground";

export default function PlaygroundPage() {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <DevicePlayground entrance="journey" />
    </main>
  );
}
