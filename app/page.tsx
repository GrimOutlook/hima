import { GraphCard } from "@/components/cards/GraphCard"
import PoolsCard from "@/components/cards/PoolsCard"
import { EventsCard } from "@/components/cards/EventsCard"
import DateSelectionCard from "@/components/cards/DateSelectionCard"

export default function Home() {
  return (
    <div id="home" className="flex flex-row p-2 h-dvh w-dvw" >
      <div className="flex flex-col min-w-96 w-fit h-full gap-1 p-0.5" >
        <DateSelectionCard className="w-full h-[20dvh]" />
        <PoolsCard className="size-full h-[40dvh]" />
        <EventsCard className="size-full h-[40dvh]" />
      </div>

      <div className="w-full p-0.5">
        <GraphCard className="min-w-72 w-full h-fit" />
      </div>
    </div>
  );
}
