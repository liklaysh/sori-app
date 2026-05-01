import { lazy, Suspense } from "react";
import type { MouseEvent } from "react";
import { Loader2 } from "lucide-react";
import { DirectCallOverlay } from "../components/DirectCallOverlay";
import { SettingsPanel } from "../components/SettingsPanel";
import { userToCallPeer } from "../stores/directCallStore";
import { useMainShellController } from "../features/main/useMainShellController";
import {
  ChannelSidebar,
  ChatHeader,
  DMSidebar,
  MemberContextMenu,
  MemberSidebar,
  MessageComposer,
  MessageList,
  ServerRail,
  UserControlBlock,
  VoiceChannelView,
  VoiceVolumeMenu
} from "../features/main/MainShellViews";

const VoiceSession = lazy(() =>
  import("../components/VoiceSession").then((module) => ({ default: module.VoiceSession }))
);

export function MainShell() {
  const state = useMainShellController();
  const showVoiceRoom = Boolean(state.isVoiceChannelView && state.activeChannel && state.connectedChannelId === state.activeChannel.id);
  const showDirectCallRoom = Boolean(state.isExpandedDirectCall && state.directCallPartner);
  const userControlBlock = (
    <UserControlBlock
      user={state.user}
      connectedChannel={state.connectedChannel}
      voiceStatus={state.voiceStatus}
      isMuted={state.isMuted}
      isDeafened={state.isDeafened}
      onMute={state.toggleMute}
      onDeafen={state.toggleDeafen}
      onLeaveVoice={() => state.leaveVoiceChannel()}
      t={state.t}
    />
  );

  return (
    <main className="flex h-full overflow-hidden bg-sori-surface-base text-sori-text-primary">
      <ServerRail
        activeModule={state.showCommunity ? "community" : "dm"}
        totalUnreadDMs={state.totalUnreadDMs}
        onCommunity={state.goCommunity}
        onDM={state.goDM}
        onSettings={() => state.setSettingsOpen(true)}
        onLogout={state.logout}
        t={state.t}
      />

      {state.showCommunity ? (
        <ChannelSidebar
          serverName={state.bootstrap?.server.name || "SORI"}
          channels={state.channels}
          activeChannelId={state.activeChannelId}
          connectedChannelId={state.connectedChannelId}
          collapsedCategories={state.collapsedCategories}
          occupantsByChannel={state.occupantsByChannel}
          currentUserId={state.user?.id}
          onSelectChannel={(channel) => void state.handleSelectChannel(channel)}
          onToggleCategory={state.toggleCategory}
          onVoiceOccupantContextMenu={state.openVoiceVolumeMenu}
          footer={userControlBlock}
          t={state.t}
        />
      ) : (
        <DMSidebar
          conversations={state.conversations}
          user={state.user}
          activeConversationId={state.activeConversationId}
          onlineUsers={state.onlineUsers}
          onSelect={(conversationId) => void state.selectConversation(conversationId)}
          onCall={(peer) => {
            if (state.directCallStatus === "idle") state.initiateCall(userToCallPeer(peer));
          }}
          footer={userControlBlock}
          t={state.t}
        />
      )}

      <section className="flex min-w-0 flex-1 flex-col bg-sori-surface-base">
        {!state.isExpandedDirectCall && !showVoiceRoom && (
          <ChatHeader
            mode={state.activeMode}
            title={state.activeTitle}
            channel={state.activeChannel}
            peer={state.activePeer}
            online={Boolean(state.activePeer?.id && state.onlineUsers.has(state.activePeer.id))}
            directCallStatus={state.directCallStatus}
            searchQuery={state.messageSearchQuery}
            onSearchChange={state.setMessageSearchQuery}
            onCall={() => {
              if (state.activePeer && state.directCallStatus === "idle") {
                state.initiateCall(userToCallPeer(state.activePeer));
              }
            }}
            t={state.t}
          />
        )}

        {state.loading ? (
          <div className="grid flex-1 place-items-center">
            <div className="flex items-center gap-3 text-sm font-bold text-sori-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-sori-accent-primary" />
              {state.t.loadingChat}
            </div>
          </div>
        ) : (
          <>
            {showDirectCallRoom ? (
              <Suspense fallback={null}>
                <VoiceSession
                  presentation="direct-call"
                  title={state.directCallPartner?.username}
                  startedAt={state.directCallStartedAt}
                  onMinimize={() => state.setIsDirectCallExpanded(false)}
                />
              </Suspense>
            ) : showVoiceRoom ? (
              <Suspense fallback={null}>
                <VoiceSession
                  presentation="voice-room"
                  title={state.activeTitle}
                  startedAt={state.voiceStartedAt}
                />
              </Suspense>
            ) : state.isVoiceChannelView ? (
              <VoiceChannelView
                channel={state.activeChannel}
                connected={state.connectedChannelId === state.activeChannel?.id}
                connecting={state.voiceStatus === "connecting"}
                occupants={state.activeChannel ? state.occupantsByChannel[state.activeChannel.id] || [] : []}
                currentUserId={state.user?.id}
                startedAt={state.voiceStartedAt}
                isMuted={state.isMuted}
                isDeafened={state.isDeafened}
                onVoiceOccupantContextMenu={(occupant, event) => state.activeChannel && state.openVoiceVolumeMenu(occupant, state.activeChannel.id, event)}
                onJoin={() => state.activeChannel && void state.joinVoiceChannel(state.activeChannel.id)}
                onMute={state.toggleMute}
                onDeafen={state.toggleDeafen}
                onLeave={() => state.leaveVoiceChannel()}
                t={state.t}
              />
            ) : (
              <MessageList
                items={state.filteredMessages}
                currentUser={state.user}
                emptyText={state.messageSearchQuery.trim() ? state.t.noSearchResults : state.t.noMessages}
                t={state.t}
              />
            )}

            {state.canSendMessage && !state.isExpandedDirectCall && (
              <MessageComposer
                disabled={state.sending}
                placeholder={`${state.t.messagePlaceholder} ${state.activeTitle}`}
                sendLabel={state.t.send}
                attachLabel={state.t.attach}
                uploadingLabel={state.t.uploading}
                typingUser={state.typingUser}
                typingLabel={state.t.typingMessage}
                onTypingChange={state.emitTyping}
                onSend={state.sendActiveMessage}
              />
            )}
          </>
        )}
      </section>

      {!state.isVoiceChannelView && !state.isExpandedDirectCall && (
        <MemberSidebar
          members={state.members}
          onlineUsers={state.onlineUsers}
          currentUserId={state.user?.id}
          onMemberClick={(member, event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            state.setMemberMenu({ member, x: event.clientX, y: event.clientY });
          }}
          t={state.t}
        />
      )}

      {state.memberMenu && (
        <MemberContextMenu
          menu={state.memberMenu}
          isOnline={state.onlineUsers.has(state.memberMenu.member.id)}
          isCurrentUser={state.memberMenu.member.id === state.user?.id}
          onChat={() => void state.handleMemberAction(state.memberMenu!.member, "chat")}
          onCall={() => void state.handleMemberAction(state.memberMenu!.member, "call")}
          t={state.t}
        />
      )}

      {state.voiceVolumeMenu && (
        <VoiceVolumeMenu
          menu={state.voiceVolumeMenu}
          volume={state.participantVolumes[state.voiceVolumeMenu.occupant.userId] ?? 100}
          onChange={(volume) => state.setParticipantVolume(state.voiceVolumeMenu!.occupant.userId, volume)}
          t={state.t}
        />
      )}

      {(state.connectedChannelId || state.directCallStatus === "connected") && !showVoiceRoom && !showDirectCallRoom && (
        <Suspense fallback={null}>
          <VoiceSession presentation="hidden" />
        </Suspense>
      )}
      <DirectCallOverlay
        isMaximized={Boolean(state.isExpandedDirectCall)}
        onToggleMaximize={() => state.setIsDirectCallExpanded(true)}
      />
      <SettingsPanel open={state.settingsOpen} onClose={() => state.setSettingsOpen(false)} />
    </main>
  );
}
