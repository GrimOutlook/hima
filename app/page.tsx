import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { GraphCard } from "@/components/cards/graph"
import { PoolsCard } from "@/components/cards/pools"
import { EventsCard } from "@/components/cards/events"

export default function Home() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="w-full h-screen rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={25}>
            <PoolsCard className="flex w-full h-full items-center justify-center p-6"/>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={75}>
            <EventsCard className="flex w-full h-full items-center justify-center p-6"/>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50} className="h-full">
        <GraphCard className="w-full h-full items-center justify-center p-6"/>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
