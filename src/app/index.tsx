import "@/global.css";
import { ScrollView, View } from "react-native";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-green-200">
      <ScrollView className="flex-1 flex-col items-center justify-center bg-red-300">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Pools</CardTitle>
            <CardDescription>
              Collections of leave hours that can be used to take time off work
            </CardDescription>
          </CardHeader>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
