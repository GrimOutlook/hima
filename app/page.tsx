import { GraphCard } from "@/components/cards/GraphCard"
import PoolsCard from "@/components/cards/PoolsCard"
import { EventsCard } from "@/components/cards/EventsCard"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup } from "@/components/ui/resizable";

export default function Home() {
  return (
    <ResizablePanelGroup direction="horizontal" className="p-2 h-dvh w-dvw" >
      <ResizablePanel className="m-2 mr-1" minSize={20} defaultSize={33}>
        <PoolsCard className="size-full" />
      </ResizablePanel>
      <ResizableHandle className="bg-transparent" />
      <ResizablePanel className="m-2 ml-1" defaultSize={67}>
        <EventsCard className="size-full" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
