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
      className="h-full w-full rounded-lg border"
    >
      <ResizablePanel>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel>
            <PoolsCard className="h-full w-full"/>
          </ResizablePanel>

          <ResizableHandle/>

          <ResizablePanel>
            <EventsCard className="h-full w-full"/>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle/>

      <ResizablePanel>
        <GraphCard className="h-full w-full"/>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
