export interface RoadmateSession {
  id: string;
  name: string;
  avatars: string[];
  isGroup: boolean;
  memberCount?: number;
  lastPreview: string;
  lastType: "voice" | "emoji";
  time: string;
  unread?: number;
  isNew?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: "me" | "them";
  voiceDuration: string;
  transcript: string;
  reactions?: string[];
}

export interface SocialPost {
  id: string;
  platform: "xiaohongshu" | "twitter";
  content: string;
  time: string;
  likes?: number;
}

export const NEW_ROADMATE_HINT = "You have 2 new Roadmates";

export const NEW_ROADMATE_AVATARS = [
  "https://randomuser.me/api/portraits/women/17.jpg",
  "https://randomuser.me/api/portraits/men/46.jpg",
] as const;

/** Demo avatars: free static portraits from randomuser.me, no API key needed */
const AVATARS = {
  rideGroup: "https://randomuser.me/api/portraits/men/52.jpg",
  meet798: "https://randomuser.me/api/portraits/women/65.jpg",
  meet798b: "https://randomuser.me/api/portraits/men/71.jpg",
  meet798c: "https://randomuser.me/api/portraits/women/33.jpg",
  linwan: "https://randomuser.me/api/portraits/women/44.jpg",
  azhe: "https://randomuser.me/api/portraits/men/32.jpg",
} as const;

export const MOCK_SESSIONS: RoadmateSession[] = [
  {
    id: "u1",
    name: "Lin Wan",
    avatars: [AVATARS.linwan],
    isGroup: false,
    lastPreview: "Voice · That cafe was great",
    lastType: "voice",
    time: "Yesterday",
  },
  {
    id: "u2",
    name: "A-Zhe",
    avatars: [AVATARS.azhe],
    isGroup: false,
    lastPreview: "🎉",
    lastType: "emoji",
    time: "Sat",
  },
  {
    id: "g1",
    name: "Weekend Ride Crew",
    avatars: [
      AVATARS.rideGroup,
      "https://randomuser.me/api/portraits/women/28.jpg",
      "https://randomuser.me/api/portraits/men/15.jpg",
      "https://randomuser.me/api/portraits/women/91.jpg",
    ],
    isGroup: true,
    memberCount: 4,
    lastPreview: "Voice · What time tomorrow?",
    lastType: "voice",
    time: "",
    unread: 2,
    isNew: true,
  },
  {
    id: "g2",
    name: "798 Tap Meetup",
    avatars: [AVATARS.meet798, AVATARS.meet798b, AVATARS.meet798c],
    isGroup: true,
    memberCount: 3,
    lastPreview: "😊 Looking forward to meeting IRL",
    lastType: "emoji",
    time: "6/28",
    isNew: true,
  },
];

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    sender: "them",
    voiceDuration: "0:12",
    transcript: "Hey, did you try that indie game we talked about?",
    reactions: ["👋", "❤️"],
  },
  {
    id: "m3",
    sender: "me",
    voiceDuration: "0:08",
    transcript: "Yeah! The pixel-art one was perfect — want to hit an exhibit this weekend?",
  },
  {
    id: "m5",
    sender: "them",
    voiceDuration: "0:15",
    transcript: "Down. Offline chats hit different. I'll be near 798 tomorrow.",
    reactions: ["🎉", "✨", "🙌"],
  },
];

export const MOCK_ME = {
  avatar: "https://randomuser.me/api/portraits/men/22.jpg",
} as const;

export const MOCK_PROFILE = {
  name: "Lin Wan",
  avatar: AVATARS.linwan,
  matchContext: "Tapped at 798 Art District · 3 days ago",
  matchScore: 87,
  commonTags: ["Indie Games", "Film Photography", "City Walk", "Cafe Hopping", "Podcasts"],
  socialLinks: [
    { platform: "xiaohongshu" as const, label: "Xiaohongshu", handle: "@linwan_film_diary" },
    { platform: "twitter" as const, label: "X", handle: "@linwan_frames" },
  ],
  posts: [
    {
      id: "p1",
      platform: "xiaohongshu" as const,
      content:
        "Street-shot the hutongs this weekend and found a pour-over spot tucked around a corner — light was perfect.",
      time: "2 hours ago",
      likes: 128,
    },
    {
      id: "p2",
      platform: "twitter" as const,
      content: "Just finished Hyper Light Drifter for the third time. Still hits different.",
      time: "Yesterday",
      likes: 42,
    },
    {
      id: "p3",
      platform: "xiaohongshu" as const,
      content:
        "Sharing my City Walk route: Guozijian to Wudaoying, under 4 km end to end.",
      time: "3 days ago",
      likes: 356,
    },
    {
      id: "p4",
      platform: "twitter" as const,
      content: "Offline > online. Always.",
      time: "4 days ago",
      likes: 89,
    },
    {
      id: "p5",
      platform: "xiaohongshu" as const,
      content:
        "Podcast rec: the latest Random Fluctuations episode on urban wandering hit so hard.",
      time: "5 days ago",
      likes: 67,
    },
    {
      id: "p6",
      platform: "twitter" as const,
      content: "798 photo walk this Saturday? DM if interested.",
      time: "6 days ago",
      likes: 23,
    },
    {
      id: "p7",
      platform: "xiaohongshu" as const,
      content: "Film came back from the lab — the grain is softer than I expected.",
      time: "1 week ago",
      likes: 201,
    },
    {
      id: "p8",
      platform: "twitter" as const,
      content: "Matcha latte ranking updated. New #1 in Dongcheng.",
      time: "1 week ago",
      likes: 15,
    },
    {
      id: "p9",
      platform: "xiaohongshu" as const,
      content: "Today's fit: loose workwear + canvas sneakers — built for a full day of walking.",
      time: "1 week ago",
      likes: 94,
    },
    {
      id: "p10",
      platform: "twitter" as const,
      content: "Reading: Walkable City by Jeff Speck. Highly recommend.",
      time: "2 weeks ago",
      likes: 31,
    },
  ] satisfies SocialPost[],
};
