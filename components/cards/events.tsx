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

export function EventsCard() {
    return (
            <Card>
              <CardHeader>
                <CardTitle>Events</CardTitle>
                <CardDescription>Occasions that add or remove hours from a pool</CardDescription>
                <CardAction>
                    <Button variant="outline">Create</Button>
                </CardAction>
              </CardHeader>
            </Card>
    )
}
