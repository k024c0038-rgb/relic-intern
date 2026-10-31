"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: name ? { display_name: name } : undefined,
      },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {state === "sent" ? (
          <p className="text-sm">{t("sent")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t("displayName")}</Label>
              <Input id="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </div>
            {state === "error" && <p className="text-sm text-destructive">{tc("error")}</p>}
            <Button type="submit" className="w-full" disabled={state === "sending"}>
              {t("send")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
