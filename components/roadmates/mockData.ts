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

export const NEW_ROADMATE_HINT = "你有 2 位新认识的路友";

export const NEW_ROADMATE_AVATARS = [
  "https://randomuser.me/api/portraits/women/17.jpg",
  "https://randomuser.me/api/portraits/men/46.jpg",
] as const;

/** Demo 头像：randomuser.me 免费静态人像，无需 API Key */
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
    name: "林晚",
    avatars: [AVATARS.linwan],
    isGroup: false,
    lastPreview: "语音 · 那家咖啡馆不错",
    lastType: "voice",
    time: "昨天",
  },
  {
    id: "u2",
    name: "阿哲",
    avatars: [AVATARS.azhe],
    isGroup: false,
    lastPreview: "🎉",
    lastType: "emoji",
    time: "周六",
  },
  {
    id: "g1",
    name: "周末骑行小队",
    avatars: [
      AVATARS.rideGroup,
      "https://randomuser.me/api/portraits/women/28.jpg",
      "https://randomuser.me/api/portraits/men/15.jpg",
      "https://randomuser.me/api/portraits/women/91.jpg",
    ],
    isGroup: true,
    memberCount: 4,
    lastPreview: "语音 · 明天几点集合？",
    lastType: "voice",
    time: "",
    unread: 2,
    isNew: true,
  },
  {
    id: "g2",
    name: "798 碰一碰",
    avatars: [AVATARS.meet798, AVATARS.meet798b, AVATARS.meet798c],
    isGroup: true,
    memberCount: 3,
    lastPreview: "😊 期待线下见",
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
    transcript: "嗨，上次聊的独立游戏你有玩吗？",
    reactions: ["👋", "❤️"],
  },
  {
    id: "m3",
    sender: "me",
    voiceDuration: "0:08",
    transcript: "玩了！像素风那款超对味，周末要不要一起逛展？",
  },
  {
    id: "m5",
    sender: "them",
    voiceDuration: "0:15",
    transcript: "好啊，线下聊更带感。我明天在798附近。",
    reactions: ["🎉", "✨", "🙌"],
  },
];

export const MOCK_ME = {
  avatar: "https://randomuser.me/api/portraits/men/22.jpg",
} as const;

export const MOCK_PROFILE = {
  name: "林晚",
  avatar: AVATARS.linwan,
  matchContext: "碰一碰于 798 艺术区 · 3 天前",
  matchScore: 87,
  commonTags: ["独立游戏", "胶片摄影", "City Walk", "咖啡探店", "播客"],
  socialLinks: [
    { platform: "xiaohongshu" as const, label: "小红书", handle: "@林晚的胶片日记" },
    { platform: "twitter" as const, label: "X", handle: "@linwan_frames" },
  ],
  posts: [
    {
      id: "p1",
      platform: "xiaohongshu" as const,
      content: "周末在胡同里扫街，发现一家藏在转角的手冲店，光线刚好。",
      time: "2 小时前",
      likes: 128,
    },
    {
      id: "p2",
      platform: "twitter" as const,
      content: "Just finished Hyper Light Drifter for the third time. Still hits different.",
      time: "昨天",
      likes: 42,
    },
    {
      id: "p3",
      platform: "xiaohongshu" as const,
      content: "分享我的 City Walk 路线：从国子监到五道营，全程不超过 4km。",
      time: "3 天前",
      likes: 356,
    },
    {
      id: "p4",
      platform: "twitter" as const,
      content: "Offline > online. Always.",
      time: "4 天前",
      likes: 89,
    },
    {
      id: "p5",
      platform: "xiaohongshu" as const,
      content: "播客推荐：《随机波动》最新一期关于城市漫步的讨论太共鸣了。",
      time: "5 天前",
      likes: 67,
    },
    {
      id: "p6",
      platform: "twitter" as const,
      content: "798 photo walk this Saturday? DM if interested.",
      time: "6 天前",
      likes: 23,
    },
    {
      id: "p7",
      platform: "xiaohongshu" as const,
      content: "胶片冲洗出来啦，颗粒感比预期还要温柔。",
      time: "1 周前",
      likes: 201,
    },
    {
      id: "p8",
      platform: "twitter" as const,
      content: "Matcha latte ranking updated. New #1 in Dongcheng.",
      time: "1 周前",
      likes: 15,
    },
    {
      id: "p9",
      platform: "xiaohongshu" as const,
      content: "今日份穿搭：宽松工装 + 帆布鞋，适合走一整天。",
      time: "1 周前",
      likes: 94,
    },
    {
      id: "p10",
      platform: "twitter" as const,
      content: "Reading: Walkable City by Jeff Speck. Highly recommend.",
      time: "2 周前",
      likes: 31,
    },
  ] satisfies SocialPost[],
};
