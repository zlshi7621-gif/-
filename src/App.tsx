import { useState } from "react";
import { AuthPage } from "./auth/AuthPage";
import { useAuth } from "./auth/AuthContext";
import { DashboardPage } from "./dashboard/DashboardPage";
import { FriendsPage } from "./friends/FriendsPage";
import { GrowthPage } from "./growth/GrowthPage";
import { ProfilePage } from "./profile/ProfilePage";
import { RoomPage } from "./rooms/RoomPage";
import { roomApi, type RoomSummary } from "./rooms/roomApi";
import { VipPage } from "./vip/VipPage";

type ActiveView = "dashboard" | "room" | "friends" | "profile" | "growth" | "vip";

export function App() {
  const { status, accessToken } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [currentRoom, setCurrentRoom] = useState<RoomSummary | null>(null);

  if (status === "checking") {
    return (
      <main className="auth-shell">
        <section className="auth-panel compact-panel">
          <p className="loading-text">正在恢复登录状态...</p>
        </section>
      </main>
    );
  }

  if (status === "authenticated") {
    if (activeView === "room") {
      return (
        <RoomPage
          onBackToDashboard={() => setActiveView("dashboard")}
          onRoomSnapshotChange={setCurrentRoom}
          initialRoom={currentRoom}
          onOpenFriends={() => setActiveView("friends")}
          onOpenProfile={() => setActiveView("profile")}
        />
      );
    }

    if (activeView === "friends") {
      return (
        <FriendsPage
          currentRoomId={currentRoom?.id}
          currentRoomTitle={currentRoom?.title}
          onBackToRoom={() => setActiveView(currentRoom ? "room" : "dashboard")}
          onAcceptRoomInvitation={async (roomId) => {
            if (!accessToken) {
              return;
            }

            const room = await roomApi.getRoom(accessToken, roomId);
            setCurrentRoom(room);
            setActiveView("room");
          }}
        />
      );
    }

    if (activeView === "profile") {
      return <ProfilePage onBack={() => setActiveView("dashboard")} onOpenVip={() => setActiveView("vip")} />;
    }

    if (activeView === "growth") {
      return <GrowthPage onBack={() => setActiveView("dashboard")} />;
    }

    if (activeView === "vip") {
      return <VipPage onBack={() => setActiveView("profile")} />;
    }

    return (
      <DashboardPage
        currentRoom={currentRoom}
        onEnterRoom={(room) => {
          setCurrentRoom(room);
          setActiveView("room");
        }}
        onOpenRoom={() => setActiveView("room")}
        onOpenFriends={() => setActiveView("friends")}
        onOpenProfile={() => setActiveView("profile")}
        onOpenGrowth={() => setActiveView("growth")}
        onOpenVip={() => setActiveView("vip")}
      />
    );
  }

  return <AuthPage />;
}
