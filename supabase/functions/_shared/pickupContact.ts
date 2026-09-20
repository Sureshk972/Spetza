// SMS copy for the person handing a package over on a pickup-kind request.
// They never signed up, so every message is short, says who Spetza is, and
// carries the STOP line the A2P campaign promises.

export interface PickupContactContext {
  orderNumber: string;
  courierName: string | null;
  requesterName: string | null;
  description: string;
  pin: string | null;
}

export function pickupContactSms(
  event: string,
  ctx: PickupContactContext,
): string | null {
  const courier = ctx.courierName || "Your courier";
  const requester = ctx.requesterName || "a Spetza customer";
  // "their"/"them": pronouns are not on the profile, and the contact only
  // needs to know whose phone to look at.
  if (event === "accepted") {
    return (
      `Spetza: ${courier} is picking up "${ctx.description}" for ${requester}. ` +
      `Before handing it over, ask to see the job on their phone — it shows ` +
      `${ctx.orderNumber} and your name. Then give them PIN ${ctx.pin ?? "----"}. ` +
      `Reply STOP to opt out.`
    );
  }
  if (event === "arrived") {
    return `Spetza: ${courier} is outside for the pickup.`;
  }
  return null;
}
