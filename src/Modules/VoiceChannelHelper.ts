import { Client, GuildMember, PermissionOverwrites, VoiceChannel, TextChannel } from 'discord.js';
import * as sqlite from 'sqlite';

import { Module } from '../Structures/Classes';

class VoiceChannelHelper extends Module {
    db: sqlite.Database;
    config: VoiceChannelHelperConfig;

    constructor(client: Client, db: sqlite.Database, config: VoiceChannelHelperConfig) {
        super(client, "Voice Channel Helper");
        
        this.config = config;
        this.db = db;

        this.handlers.push({ event: 'voiceStateUpdate', handler: { func: this.handleVoiceStateUpdate.bind(this) }});
        this.handlers.push({ event: 'ready', handler: { func: this.handleReady.bind(this), once: true }});
    }
    
    private async purgeAll() {
        const channels = await this.db.all('SELECT text_id FROM channels WHERE set_to_purge = 1');

        for (const channel of channels) {
            await this.purge(this.client.channels.get(channel.text_id) as TextChannel);
        }
    }  
    
    private async purge(channel: TextChannel) {
        while (true) { 
            const messages = await channel.fetchMessages({ limit: 100 });

            if (messages.size > 0) {
                await channel.bulkDelete(messages);
            } else {
                this.db.run('UPDATE channels SET set_to_purge = 0 WHERE text_id = ?', [channel.id]);
                break;
            }
        }
    }

    handleReady() {
        setInterval(this.purgeAll.bind(this), this.config.purgeInterval);
    }

    async handleVoiceStateUpdate(oldMember: GuildMember, newMember: GuildMember) {
        if (oldMember.voiceChannelID === newMember.voiceChannelID) return;

        const channels = await this.db.all('SELECT voice_id, text_id FROM channels');

        if (channels.some((v) => v.voice_id == oldMember.voiceChannelID)) {
            const voiceChannel = this.client.channels.get(oldMember.voiceChannelID) as VoiceChannel;
            const textChannel = this.client.channels.get(channels.find((v) => v.voice_id == oldMember.voiceChannelID).text_id) as TextChannel;
            const permissions = textChannel.permissionOverwrites.find((v: PermissionOverwrites) => v.id === oldMember.id);

            if (voiceChannel.members.size < 1) {
                this.db.run('UPDATE channels SET set_to_purge = 1 WHERE voice_id = ?', [oldMember.voiceChannelID]);
            }

            if (permissions) permissions.delete();
            if (this.config.emitLog) textChannel.send(`${oldMember} has left the voice channel.`);
        }

        if (channels.some((v) => v.voice_id == newMember.voiceChannelID)) {
            const textChannel = this.client.channels.get(channels.find((v) => v.voice_id === newMember.voiceChannelID).text_id) as TextChannel;

            this.db.run('UPDATE channels SET set_to_purge = 0 WHERE voice_id = ?', [newMember.voiceChannelID]);

            textChannel.overwritePermissions(newMember, { "VIEW_CHANNEL": true });
            if (this.config.emitLog) textChannel.send(`${newMember} has entered the voice channel.`);
        }
    }

}

export async function voiceChannelHelper(client: Client, config: VoiceChannelHelperConfig): Promise<VoiceChannelHelper> {
    return new VoiceChannelHelper(client, await sqlite.open(__dirname + '/../../db/channels.db'), config);
}

export interface VoiceChannelHelperConfig {
    emitLog: string;
    purgeInterval: number;
}