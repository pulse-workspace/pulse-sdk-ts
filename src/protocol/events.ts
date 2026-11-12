/**
 * Event Types and Content Types catalog for Pulse wire protocol.
 * Synchronized with authoritative definitions in pkg/protocol/frames.go of Pulse server.
 */

// Event types appended to NATS JetStream event log
export const EventUserCreated = "UserCreated";
export const EventUserUpdated = "UserUpdated";
export const EventUserDeleted = "UserDeleted";

export const EventGroupCreated = "GroupCreated";
export const EventGroupDismissed = "GroupDismissed";
export const EventMemberAdded = "MemberAdded";
export const EventMemberRemoved = "MemberRemoved";
export const EventMemberRoleChanged = "MemberRoleChanged";

export const EventConvCreated = "ConvCreated";
export const EventConvUpdated = "ConvUpdated";

export const EventMessageSent = "MessageSent";
export const EventMessageRecalled = "MessageRecalled";
export const EventMessageRead = "MessageRead";

export const EventReactionAdded = "ReactionAdded";
export const EventReactionRemoved = "ReactionRemoved";

export const EventPresenceUpdated = "PresenceUpdated";

// Message content types
export const ContentText = 101;         // Plain text message
export const ContentImage = 102;        // Image media (url, dimensions, thumbnail)
export const ContentAudio = 103;        // Voice recording / audio stream
export const ContentVideo = 104;        // Video stream
export const ContentFile = 105;         // Generic document attachment
export const ContentLocation = 106;     // Geographic coordinates
export const ContentCustom = 107;       // Custom application payload
export const ContentQuote = 108;        // Reply / quoted message
export const ContentCard = 109;         // Interactive card
export const ContentNotification = 110; // System notification message
export const ContentMerge = 111;        // Merged forwarded messages
export const ContentFace = 112;         // Sticker / specialty face
export const ContentRevoke = 113;       // Message revoked notification
export const ContentAttachment = 120;   // Generic media attachment slot

// Conversation types
export const ConvSingle = 1; // 1-on-1 direct message
export const ConvGroup = 2;  // Group conversation

// Group member roles
export const RoleMember = "member";
export const RoleAdmin = "admin";
export const RoleOwner = "owner";
