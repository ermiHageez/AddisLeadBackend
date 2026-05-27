import prisma from '../utils/prisma.js';

const SUBSCRIPTION_LIMITS = {
  TRIAL: { maxVideos: 3, dailyCalls: 50 },
  BASIC: { maxVideos: 10, dailyCalls: 200 },
  PRO: { maxVideos: 30, dailyCalls: 1000 },
  AGENCY: { maxVideos: 9999, dailyCalls: 5000 }
};

const checkUsageLimit = async (userId) => {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return true;

  const now = new Date();
  const resetDate = new Date(sub.tiktokUsageResetDate);
  
  let currentUsage = sub.tiktokUsageToday;
  if (now.getDate() !== resetDate.getDate() || now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { tiktokUsageToday: 0, tiktokUsageResetDate: now }
    });
    currentUsage = 0;
  }

  const limit = SUBSCRIPTION_LIMITS[sub.plan]?.dailyCalls || 50;
  if (currentUsage >= limit) {
    throw new Error('Daily TikTok API limit reached. Please upgrade your plan.');
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { tiktokUsageToday: { increment: 1 } }
  });
  return true;
};

export const connectTikTok = async (req, res) => {
  try {
    const userId = req.user.id;
    await checkUsageLimit(userId);
    
    const mockTiktokData = {
      tiktokUserId: "tt_user_" + Math.random().toString(36).substr(2, 9),
      accessToken: "mock_access_token_" + Date.now(),
      refreshToken: "mock_refresh_token_" + Date.now(),
      username: "Agent_" + req.user.name.replace(/\s/g, ''),
      avatarUrl: "https://ui-avatars.com/api/?name=" + req.user.name + "&background=00f2ea&color=fff",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    const tikTokAccount = await prisma.tikTokAccount.upsert({
      where: { userId },
      update: { ...mockTiktokData },
      create: { userId, ...mockTiktokData }
    });

    res.status(200).json({ success: true, data: tikTokAccount });
  } catch (err) {
    console.error(err);
    res.status(err.message.includes('limit') ? 429 : 500).json({ success: false, message: err.message || 'Failed to connect TikTok' });
  }
};

export const getTikTokStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const tikTokAccount = await prisma.tikTokAccount.findUnique({
      where: { userId },
      include: { 
        user: { include: { subscription: true } },
        monitoredVideos: { where: { isMonitoring: true } }
      }
    });

    if (!tikTokAccount) {
      return res.status(200).json({ success: true, connected: false });
    }

    const plan = tikTokAccount.user.subscription?.plan || 'TRIAL';
    res.status(200).json({ 
      success: true, 
      connected: true, 
      data: {
        username: tikTokAccount.username,
        avatarUrl: tikTokAccount.avatarUrl,
        tiktokUserId: tikTokAccount.tiktokUserId,
        plan,
        monitoredCount: tikTokAccount.monitoredVideos.length,
        limits: SUBSCRIPTION_LIMITS[plan]
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const disconnectTikTok = async (req, res) => {
  try {
    const userId = req.user.id;
    await prisma.tikTokAccount.delete({
      where: { userId }
    });
    res.status(200).json({ success: true, message: 'TikTok account disconnected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to disconnect TikTok' });
  }
};

export const getRecentVideos = async (req, res) => {
  try {
    const userId = req.user.id;
    await checkUsageLimit(userId);

    const tikTokAccount = await prisma.tikTokAccount.findUnique({
      where: { userId },
      include: { monitoredVideos: true }
    });

    if (!tikTokAccount) {
      return res.status(404).json({ success: false, message: 'TikTok account not found' });
    }

    const mockVideos = [
      {
        tiktokVideoId: "v_123",
        caption: "Stunning 4-Bedroom Villa in Bole, Addis Ababa. Modern design!",
        thumbnailUrl: "https://images.unsplash.com/photo-1600585154340-be6199bc1130?w=200",
        viewCount: 15400,
        commentCount: 85
      },
      {
        tiktokVideoId: "v_456",
        caption: "Luxury Apartment for Rent in Kazanchis with city view. Available now!",
        thumbnailUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=200",
        viewCount: 22000,
        commentCount: 142
      },
      {
        tiktokVideoId: "v_789",
        caption: "Investment Opportunity: Commercial building near CMC. Contact for details.",
        thumbnailUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200",
        viewCount: 8900,
        commentCount: 34
      }
    ];

    const videos = mockVideos.map(video => {
      const monitored = tikTokAccount.monitoredVideos.find(mv => mv.tiktokVideoId === video.tiktokVideoId);
      return {
        ...video,
        isMonitoring: monitored?.isMonitoring || false
      };
    });

    res.status(200).json({ success: true, data: videos });
  } catch (err) {
    console.error(err);
    res.status(err.message.includes('limit') ? 429 : 500).json({ success: false, message: err.message || 'Failed to fetch videos' });
  }
};

export const toggleMonitorVideo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { videoId, monitor, caption, thumbnailUrl, viewCount, commentCount } = req.body;

    const tikTokAccount = await prisma.tikTokAccount.findUnique({
      where: { userId },
      include: { 
        monitoredVideos: { where: { isMonitoring: true } },
        user: { include: { subscription: true } }
      }
    });

    if (!tikTokAccount) {
      return res.status(404).json({ success: false, message: 'TikTok account not found' });
    }

    if (monitor) {
      const plan = tikTokAccount.user.subscription?.plan || 'TRIAL';
      const limit = SUBSCRIPTION_LIMITS[plan].maxVideos;

      if (tikTokAccount.monitoredVideos.length >= limit) {
        return res.status(403).json({ 
          success: false, 
          message: `Monitoring limit reached for ${plan} plan. You can monitor up to ${limit} videos. Please upgrade to monitor more.` 
        });
      }
    }

    const video = await prisma.monitoredVideo.upsert({
      where: {
        tiktokAccountId_tiktokVideoId: {
          tiktokAccountId: tikTokAccount.id,
          tiktokVideoId: videoId
        }
      },
      update: { isMonitoring: monitor },
      create: {
        tiktokAccountId: tikTokAccount.id,
        tiktokVideoId: videoId,
        isMonitoring: monitor,
        caption,
        thumbnailUrl,
        viewCount,
        commentCount
      }
    });

    res.status(200).json({ success: true, data: video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update monitoring status' });
  }
};

export const getVideoComments = async (req, res) => {
  try {
    const userId = req.user.id;
    await checkUsageLimit(userId);

    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ success: false, message: 'videoId is required' });

    const mockComments = [
      {
        id: "c_1",
        username: "abebe_beck",
        text: "How much is the price for this townhouse?",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      },
      {
        id: "c_2",
        username: "user_552",
        text: "Is it still available? check my phone 0911223344",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
      },
      {
        id: "c_3",
        username: "nice_shot",
        text: "Wow beautiful video! 🔥",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
      }
    ];

    const keywords = ["price", "interested", "available", "buy", "ይገዛለሁ", "ቤት", "ዋጋ", "ስንት", "viewing", "contact", "ሰላም"];
    const phoneRegex = /(\+251|09|07)\d{8}/;

    const comments = mockComments.map(c => {
      const hasKeyword = keywords.some(k => c.text.toLowerCase().includes(k.toLowerCase()));
      const hasPhone = phoneRegex.test(c.text.replace(/\s/g, ''));
      
      return {
        ...c,
        isHighPotential: hasKeyword || hasPhone
      };
    });

    res.status(200).json({ success: true, data: comments });
  } catch (err) {
    console.error(err);
    res.status(err.message.includes('limit') ? 429 : 500).json({ success: false, message: err.message || 'Failed to fetch comments' });
  }
};

export const getTikTokUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    const tikTokAccount = await prisma.tikTokAccount.findUnique({
      where: { userId },
      include: { monitoredVideos: { where: { isMonitoring: true } } }
    });

    const plan = sub?.plan || 'TRIAL';
    const limits = SUBSCRIPTION_LIMITS[plan];

    res.status(200).json({
      success: true,
      data: {
        plan,
        monitoredVideos: {
          current: tikTokAccount?.monitoredVideos.length || 0,
          limit: limits.maxVideos
        },
        dailyApiCalls: {
          current: sub?.tiktokUsageToday || 0,
          limit: limits.dailyCalls
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch usage data' });
  }
};

export const getTikTokStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monitoredCount, leadsThisMonth] = await Promise.all([
      prisma.monitoredVideo.count({
        where: {
          tikTokAccount: { userId },
          isMonitoring: true
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          source: 'TikTok',
          createdAt: { gte: startOfMonth }
        }
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        monitoredCount,
        leadsThisMonth,
        totalLeadsAllTime: await prisma.lead.count({ where: { userId, source: 'TikTok' } })
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch TikTok stats' });
  }
};
