import FeiShuIcon from "./img/feishu.svg?react"
import DingdingIcon from "./img/dingding.svg?react"
import EmailIcon from "./img/Email.svg?react"
import WeChatIcon from "./img/qywechat.svg?react"
import WebHookIcon from "./img/webhook.svg?react"
import SlackIcon from "./img/slack.svg?react"
import PhoneIcon from "./img/phone.svg?react"
import SMSIcon from "./img/sms.svg?react"
import SREFlowIcon from "./img/sreflow.svg?react"


const NOTIFICATION_TYPES = {
    FeiShu: {
        icon: FeiShuIcon,
        label: "飞书",
    },
    DingDing: {
        icon: DingdingIcon,
        label: "钉钉",
    },
    Email: {
        icon: EmailIcon,
        label: "邮件",
    },
    WeChat: {
        icon: WeChatIcon,
        label: "企业微信",
    },
    WebHook: {
        icon: WebHookIcon,
        label: "WebHook",
    },
    Slack: {
        icon: SlackIcon,
        label: "Slack"
    },
    Phone: {
        icon: PhoneIcon,
        label: "电话"
    },
    SMS: {
        icon: SMSIcon,
        label: "短信"
    },
    SREFlow: {
        icon: SREFlowIcon,
        label: "SREFlow"
    }
}

export const NotificationTypeIcon = ({ type }) => {
    const notificationType = NOTIFICATION_TYPES[type]

    if (!notificationType) {
        return "-"
    }

    const IconComponent = notificationType.icon

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            <IconComponent style={{ height: "25px", width: "25px" }} />
            <div style={{ marginLeft: "5px", fontSize: "12px" }}>{notificationType.label}</div>
        </div>
    )
}
