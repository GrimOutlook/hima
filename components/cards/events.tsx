import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function EventsCard({ className }: React.ComponentProps<"div">) {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>Events</CardTitle>
                <CardDescription>Occasions that add or remove hours from a pool</CardDescription>
                <CardAction>
                    <Button variant="outline">Create</Button>
                </CardAction>
            </CardHeader>
            <CardContent>

            </CardContent>
            <CardFooter>
                0 Events Tracked
            </CardFooter>
        </Card>
    )
}
