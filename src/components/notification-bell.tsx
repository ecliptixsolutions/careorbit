import { Bell, CheckCheck, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationBell() {
  const { data = [], unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">
              Appointment alerts and message-ready reminders
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : data.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <div className="divide-y">
              {data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markRead.mutate(item)}
                  className="w-full p-3 text-left hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {!item.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                        <div className="truncate text-sm font-medium">{item.title}</div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                    </div>
                    {item.phone && (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                        <MessageCircle className="h-3 w-3" />
                        Phone
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
