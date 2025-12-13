import "@/global.css";
import { ScrollView, View } from "react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function App() {
  return (
    <ScrollView className="flex-1 w-full items-center justify-center bg-white">
      <View className="flex-col w-full">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Pools</CardTitle>
          </CardHeader>
        </Card>
      </View>
    </ScrollView>
  );
}
