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
            <ResizablePanel defaultSize={33} minSize={20}>
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={50}>
                        <PoolsCard className="h-full w-full" />
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel defaultSize={50}>
                        <EventsCard className="h-full w-full" />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={67}>
                <GraphCard className="h-full w-full" />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
