const Notification = require('../models/Notification');
const User = require('../models/User');
const { deliverPush, isInvalidDeviceToken } = require('./pushService');

async function createNotification(input) {
  const notification = await Notification.create(input);
  const user = await User.findById(input.recipient).select('pushTokens notificationPreferences');
  if (!user || user.notificationPreferences?.push === false) return notification;

  const tokens = user.pushTokens || [];
  await Promise.all(tokens.map(async (deviceToken) => {
    try {
      await deliverPush(deviceToken, notification);
    } catch (error) {
      if (isInvalidDeviceToken(error)) {
        await User.updateOne(
          { _id: user._id },
          { $pull: { pushTokens: { token: deviceToken.token } } },
        );
      }
    }
  }));
  return notification;
}

module.exports = { createNotification };
