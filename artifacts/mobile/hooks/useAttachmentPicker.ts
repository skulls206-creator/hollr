import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { api } from "@/lib/api";

export interface PendingAttachment {
  localUri: string;
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
}

export function getAttachmentUrl(objectPath: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return `https://${domain}/api/storage${objectPath}`;
}

export function useAttachmentPicker() {
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Allow access to your photo library to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() ?? "jpg";
    const mimeType = asset.mimeType ?? `image/${ext}`;
    const fileName = `attachment-${Date.now()}.${ext}`;

    setUploading(true);
    try {
      const fileData = await fetch(asset.uri);
      const blob = await fileData.blob();
      const fileSize = blob.size || asset.fileSize || 1;

      const { uploadURL, objectPath } = await api<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: fileName, size: fileSize, contentType: mimeType }) }
      );

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      setPending({ localUri: asset.uri, objectPath, name: fileName, contentType: mimeType, size: fileSize });
    } catch (e) {
      Alert.alert("Upload Failed", (e instanceof Error ? e.message : null) ?? "Could not upload image");
    } finally {
      setUploading(false);
    }
  };

  const clear = () => setPending(null);

  return { pending, uploading, pick, clear };
}
