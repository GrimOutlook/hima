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

export function PoolsCard({ className }: React.ComponentProps<"div">) {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>Pools</CardTitle>
                <CardDescription>Pools track amount of hours available for paid time off work</CardDescription>
                <CardAction>
                    <Button variant="outline">Create</Button>
                </CardAction>
            </CardHeader>
            <CardContent>

            </CardContent>
            <CardFooter>
                0 Tracked Pools
            </CardFooter>
        </Card>
    )
}
