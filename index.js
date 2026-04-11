const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

const { google } = require("googleapis");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---- GOOGLE AUTH ----
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
async function addToSheet(discordUser, name, item, amount) {
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Sheet1!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[timestamp, discordUser, name, item, amount]]
    }
  });
}

// ---- REGISTER SLASH COMMAND ----
const commands = [
  new SlashCommandBuilder()
    .setName("mining")
    .setDescription("Submit your mining completion")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guildId = "1449801196893241455";

await rest.put(
  Routes.applicationGuildCommands(client.user.id, guildId),
  { body: commands }
);

  console.log("Slash command registered.");
});

// ---- INTERACTIONS ----
client.on("interactionCreate", async (interaction) => {

  // Slash command /mining
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "mining") {

      const modal = new ModalBuilder()
        .setCustomId("miningForm")
        .setTitle("Mining Completion Form");

      const nameInput = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("What is your name?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const itemInput = new TextInputBuilder()
        .setCustomId("item")
        .setLabel("What did you get?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("How much?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(itemInput),
        new ActionRowBuilder().addComponents(amountInput)
      );

      await interaction.showModal(modal);
    }
  }

  // Modal submission
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "miningForm") {

      const name = interaction.fields.getTextInputValue("name");
      const item = interaction.fields.getTextInputValue("item");
      const amount = interaction.fields.getTextInputValue("amount");

      try {
        await addToSheet(interaction.user.tag, name, item, amount);

        await interaction.reply({
          content: `✅ Submitted!\n**Name:** ${name}\n**Item:** ${item}\n**Amount:** ${amount}`,
          ephemeral: true
        });

      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: "❌ Failed to upload to Google Sheets. Check bot console.",
          ephemeral: true
        });
      }
    }
  }
});

client.login(process.env.TOKEN);