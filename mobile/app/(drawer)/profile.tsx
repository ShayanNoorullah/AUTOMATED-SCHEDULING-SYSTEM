import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/endpoints";
import { AppLogo } from "../../src/components/AppLogo";
import type { Profile } from "../../src/types";
import { colors, styles } from "../../src/theme";

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");

  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setDisplayName(p.displayName || "");
    });
  }, []);

  async function saveProfile() {
    try {
      await api.updateProfile(displayName.trim());
      Alert.alert("Saved", "Profile updated");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    }
  }

  async function changePw() {
    if (nw.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    if (nw !== nw2) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    try {
      await api.changePassword(cur, nw);
      setCur("");
      setNw("");
      setNw2("");
      Alert.alert("Done", "Password updated");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Password change failed");
    }
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.hint}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.card, { alignItems: "center", paddingVertical: 24 }]}>
        <AppLogo size={64} iconSize={36} />
        <Text style={[styles.title, { marginTop: 12, textAlign: "center" }]}>
          {profile.displayName || profile.email}
        </Text>
        <Text style={[styles.listSub, { textAlign: "center" }]}>{profile.email}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{profile.role}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ionicons name="create-outline" size={18} color={colors.accent} />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>
        <Text style={styles.label}>Display name</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />
        <Text style={styles.label}>Email</Text>
        <TextInput style={[styles.input, styles.inputRO]} value={profile.email} editable={false} />
        <Pressable style={styles.btn} onPress={saveProfile}>
          <Text style={styles.btnText}>Save changes</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ionicons name="key-outline" size={18} color={colors.accent} />
          <Text style={styles.sectionTitle}>Change password</Text>
        </View>
        <Text style={styles.label}>Current password</Text>
        <TextInput style={styles.input} secureTextEntry value={cur} onChangeText={setCur} />
        <Text style={styles.label}>New password</Text>
        <TextInput style={styles.input} secureTextEntry value={nw} onChangeText={setNw} />
        <Text style={styles.label}>Confirm new password</Text>
        <TextInput style={styles.input} secureTextEntry value={nw2} onChangeText={setNw2} />
        <Pressable style={styles.btnSoft} onPress={changePw}>
          <Text style={styles.btnSoftText}>Update password</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
