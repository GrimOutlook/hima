import { GraphCard } from "@/components/cards/GraphCard"
import { PoolsCard } from "@/components/cards/PoolsCard"
import { EventsCard } from "@/components/cards/EventsCard"

export default function Home() {
  return (
    <div id="home" className="flex flex-row h-full w-full">
      <div className="flex flex-col h-full">
        <PoolsCard className="m-2 min-w-72" />
        <EventsCard className="m-2 min-w-72" />
      </div>

      <div className="w-full">
        <GraphCard className="m-2 min-w-72" />
      </div>
    </div>
  );
}
