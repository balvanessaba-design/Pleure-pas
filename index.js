// Bot Discord "pleure pas"
// Commandes : +snip, +dox, +doglaisse / +unlaisse

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
  PermissionsBitField,
} = require("discord.js");

const PREFIX = "+";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ---- Stockage en mémoire ----
// Dernier message supprimé, par salon (pour +snip)
const lastDeleted = new Map(); // channelId -> { content, author, imageURL, time }

// Paires "laisse" actives, par serveur : ownerId -> targetId
const leashes = new Map(); // guildId -> Map(ownerId -> targetId)

client.once(Events.ClientReady, (c) => {
  console.log(`Connecté en tant que ${c.user.tag}`);
  c.user.setActivity("pleure pas", { type: ActivityType.Watching });
});

// ---- Capture des messages supprimés (pour +snip) ----
client.on(Events.MessageDelete, (message) => {
  if (!message.guild || message.partial) return;
  if (message.author?.bot) return;

  lastDeleted.set(message.channelId, {
    content: message.content || "*[message sans texte, ex: image]*",
    author: message.author?.tag ?? "Inconnu",
    imageURL: message.attachments?.first()?.url ?? null,
    time: Date.now(),
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // ================= +snip =================
  if (message.content === `${PREFIX}snip`) {
    const sniped = lastDeleted.get(message.channelId);
    if (!sniped) {
      return message.reply("Rien à sniper ici pour le moment.");
    }
    const embed = {
      color: 0x2f3136,
      author: { name: sniped.author },
      description: sniped.content,
      image: sniped.imageURL ? { url: sniped.imageURL } : undefined,
      footer: { text: "Message supprimé" },
      timestamp: new Date(sniped.time).toISOString(),
    };
    return message.channel.send({ embeds: [embed] });
  }

  // ================= +dox =================
  if (message.content === `${PREFIX}dox`) {
    return message.channel.send(
      `<@${message.author.id}> c'est pas bien de dox, va dormir 😴`
    );
  }

  // ================= +doglaisse @personne =================
  // Version safe : pas de ping/follow automatique.
  // Ça crée juste un lien "laisse" entre toi et la personne,
  // et le bot le rappelle quand vous vous parlez tous les deux.
  if (message.content.startsWith(`${PREFIX}doglaisse`)) {
    const target = message.mentions.users.first();
    if (!target) {
      return message.reply("Utilisation : `+doglaisse @personne`");
    }
    if (target.id === message.author.id) {
      return message.reply("Tu ne peux pas te mettre toi-même en laisse.");
    }
    if (target.bot) {
      return message.reply("Tu ne peux pas mettre un bot en laisse.");
    }

    if (!leashes.has(message.guild.id)) {
      leashes.set(message.guild.id, new Map());
    }
    leashes.get(message.guild.id).set(message.author.id, target.id);

    return message.channel.send(
      `🐕 <@${target.id}> est maintenant en laisse par <@${message.author.id}> !`
    );
  }

  // ================= +message [ID] [message] =================
  // Réservé aux modérateurs : envoie un MP à un membre du serveur.
  if (message.content.startsWith(`${PREFIX}message`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("Tu n'as pas la permission d'utiliser cette commande.");
    }

    const args = message.content.slice(`${PREFIX}message`.length).trim().split(/\s+/);
    const targetId = args.shift();
    const dmContent = args.join(" ");

    if (!targetId || !dmContent) {
      return message.reply("Utilisation : `+message [ID] [message]`");
    }
    if (!/^\d{17,20}$/.test(targetId)) {
      return message.reply("ID invalide.");
    }

    const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return message.reply("Cette personne n'est pas membre de ce serveur.");
    }

    try {
      await targetMember.send(
        `Message de la part de **${message.guild.name}** :\n${dmContent}`
      );
      return message.reply(`Message envoyé à <@${targetId}>.`);
    } catch {
      return message.reply("Impossible d'envoyer un MP à cette personne (MPs fermés).");
    }
  }

  // ================= +unlaisse =================
  if (message.content === `${PREFIX}unlaisse`) {
    const guildLeashes = leashes.get(message.guild.id);
    if (guildLeashes && guildLeashes.has(message.author.id)) {
      guildLeashes.delete(message.author.id);
      return message.reply("Laisse détachée.");
    }
    return message.reply("Tu n'as personne en laisse actuellement.");
  }

  // ================= Effet de la laisse =================
  // Si la personne "en laisse" parle, le bot mentionne son maître.
  const guildLeashes = leashes.get(message.guild.id);
  if (guildLeashes) {
    for (const [ownerId, targetId] of guildLeashes.entries()) {
      if (message.author.id === targetId) {
        message.react("🐾").catch(() => {});
        message.reply({
          content: `*(en laisse par <@${ownerId}>)*`,
          allowedMentions: { users: [] }, // pas de ping, juste un rappel visuel
        }).catch(() => {});
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
